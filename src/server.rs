use std::collections::HashMap;
use std::sync::Arc;

use anyhow::{Context, Result, anyhow, bail};
use rmcp::{ErrorData, RoleServer, ServerHandler, ServiceExt, model::*, service::RequestContext};
use serde::Deserialize;
use serde_json::{Value, json};

use crate::{catalog, client, doctor, format, guidance, workflows};

#[derive(Deserialize)]
struct Contract {
    tools: Vec<Tool>,
    resources: Vec<Resource>,
}

#[derive(Clone)]
pub struct Server {
    contract: Arc<Contract>,
    inputs: Arc<HashMap<String, jsonschema::Validator>>,
    endpoints: Arc<HashMap<&'static str, &'static catalog::Endpoint>>,
    api: client::Api,
    local_files: bool,
}

impl Server {
    pub fn new(local_files: bool) -> Result<Self> {
        let contract: Contract = serde_json::from_str(include_str!("data/mcp_contract.json"))
            .context("Contrato MCP inválido")?;
        let inputs = contract
            .tools
            .iter()
            .map(|tool| {
                let schema = Value::Object((*tool.input_schema).clone());
                let validator = jsonschema::validator_for(&schema)
                    .map_err(|error| anyhow!("Esquema inválido para {}: {error}", tool.name))?;
                Ok((tool.name.to_string(), validator))
            })
            .collect::<Result<HashMap<_, _>>>()?;
        let endpoints = catalog::endpoints()
            .iter()
            .map(|endpoint| (endpoint.name.as_str(), endpoint))
            .collect();
        Ok(Self {
            contract: Arc::new(contract),
            inputs: Arc::new(inputs),
            endpoints: Arc::new(endpoints),
            api: client::Api::new(),
            local_files,
        })
    }

    pub async fn stdio(self) -> Result<()> {
        self.serve(rmcp::transport::stdio())
            .await?
            .waiting()
            .await?;
        Ok(())
    }

    fn arguments(&self, name: &str, args: Option<JsonObject>) -> Result<Value> {
        let schema = self.inputs.get(name).ok_or_else(|| {
            anyhow!("Unknown tool {name}. Next step: call tiendanube_start_here or tiendanube_find_tool.")
        })?;
        let mut args = Value::Object(args.unwrap_or_default());
        if let Err(error) = schema.validate(&args) {
            let path = error.instance_path().to_string();
            let field = if path.is_empty() {
                "input"
            } else {
                path.as_str()
            };
            return Err(anyhow!(
                "Invalid arguments ({field}): {error}\nNext step: check the required fields and types in the tool schema."
            ));
        }
        if let Some(tool) = self.contract.tools.iter().find(|tool| tool.name == name)
            && let Some(props) = tool
                .input_schema
                .get("properties")
                .and_then(Value::as_object)
            && let Some(args) = args.as_object_mut()
        {
            for (key, property) in props {
                if let Some(default) = property.get("default") {
                    args.entry(key).or_insert_with(|| default.clone());
                }
            }
        }
        Ok(args)
    }

    async fn invoke(&self, name: &str, args: Option<JsonObject>) -> Result<CallToolResult> {
        let args = self.arguments(name, args)?;
        match name {
            "tiendanube_start_here" => Ok(guidance::start()),
            "tiendanube_find_tool" => {
                Ok(guidance::find(args["query"].as_str().unwrap_or_default()))
            }
            "tiendanube_get_recipe" => Ok(guidance::recipe(&args)),
            "tiendanube_doctor" => {
                let probe = args["probe_scopes"].as_bool().unwrap_or(true);
                let report = doctor::diagnose(&self.api, probe).await?;
                let mut result = CallToolResult::success(vec![ContentBlock::text(
                    doctor::render_report(&report),
                )]);
                result.structured_content = Some(report);
                Ok(result)
            }
            "tiendanube_api_request" => {
                let method = args["method"].as_str().unwrap_or("GET");
                let path = args["path"].as_str().unwrap_or_default();
                let version = args["api_version"].as_str();
                let query = args.get("query").unwrap_or(&Value::Null);
                let body = args.get("body");
                let response = self
                    .api
                    .request(method, path, version, query, body)
                    .await
                    .map_err(|error| {
                        anyhow!(client::format_error(&error, "the scope of that resource"))
                    })?;
                Ok(format::render(&response.data, "json").into_result())
            }
            "tiendanube_create_combo" | "tiendanube_product_image_add_from_file" => {
                workflows::call(&self.api, name, &args, self.local_files).await
            }
            "tiendanube_oauth_exchange_code" => {
                bail!(
                    "OAuth authorization runs in the local terminal so secrets and access tokens never enter the chat. Next step: run `tiendanube-mcp login` (or `tiendanube-mcp onboard`) locally."
                )
            }
            other => {
                let endpoint = self.endpoints.get(other).ok_or_else(|| {
                    anyhow!(
                        "Unknown tool {other}. Next step: call tiendanube_start_here or tiendanube_find_tool."
                    )
                })?;
                endpoint.invoke(&self.api, &args).await
            }
        }
    }
}

impl ServerHandler for Server {
    fn get_info(&self) -> ServerConfig {
        ServerConfig::new(
            ServerCapabilities::builder()
                .enable_tools()
                .enable_resources()
                .build(),
        )
        .with_server_info(Implementation::new(
            "tiendanube-mcp",
            env!("CARGO_PKG_VERSION"),
        ))
        .with_instructions(guidance::instructions().to_owned())
    }

    async fn list_tools(
        &self,
        _: Option<PaginatedRequestParams>,
        _: RequestContext<RoleServer>,
    ) -> Result<ListToolsResult, ErrorData> {
        Ok(ListToolsResult::with_all_items(self.contract.tools.clone()))
    }

    async fn call_tool(
        &self,
        request: CallToolRequestParams,
        _: RequestContext<RoleServer>,
    ) -> Result<CallToolResponse, ErrorData> {
        let result = match self.invoke(&request.name, request.arguments).await {
            Ok(result) => result,
            Err(error) => CallToolResult::error(vec![ContentBlock::text(error.to_string())]),
        };
        Ok(result.into())
    }

    async fn list_resources(
        &self,
        _: Option<PaginatedRequestParams>,
        _: RequestContext<RoleServer>,
    ) -> Result<ListResourcesResult, ErrorData> {
        Ok(ListResourcesResult::with_all_items(
            self.contract.resources.clone(),
        ))
    }

    async fn read_resource(
        &self,
        request: ReadResourceRequestParams,
        _: RequestContext<RoleServer>,
    ) -> Result<ReadResourceResponse, ErrorData> {
        let Some(text) = guidance::resource(&request.uri) else {
            return Err(ErrorData::resource_not_found(
                "Unknown Tiendanube resource",
                Some(json!({"uri": request.uri})),
            ));
        };
        Ok(ReadResourceResult::new(vec![
            ResourceContents::text(text, request.uri).with_mime_type("text/markdown"),
        ])
        .into())
    }
}
