use std::sync::LazyLock;

use anyhow::{Context, Result, bail};
use regex::Regex;
use rmcp::model::CallToolResult;
use serde::Deserialize;
use serde_json::{Map, Value, json};

use crate::{
    client::{Api, ApiError, format_error, id_segment},
    format,
};

#[derive(Deserialize)]
pub struct Endpoint {
    pub group: String,
    pub name: String,
    pub method: String,
    pub scope: String,
    pub path: String,
    pub version: Option<String>,
    pub price_tables_version: bool,
    pub description: String,
    pub title: String,
    query: Vec<String>,
    body: Option<Vec<String>>,
    body_key: Option<String>,
    pub list: bool,
    fields: bool,
}

static ENDPOINTS: LazyLock<Vec<Endpoint>> = LazyLock::new(|| {
    serde_json::from_str(include_str!("data/endpoints.json")).expect("embedded API catalog")
});
static PLACEHOLDER: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\{([A-Za-z_]+)\}").expect("static endpoint placeholder pattern"));

pub fn endpoints() -> &'static [Endpoint] {
    &ENDPOINTS
}

#[derive(Debug, serde::Serialize)]
pub struct Request<'a> {
    method: &'a str,
    path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    version: Option<&'a str>,
    query: Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    body: Option<Value>,
}

fn select(input: &Value, keys: &[String]) -> Map<String, Value> {
    keys.iter()
        .filter_map(|name| input.get(name).map(|value| (name.clone(), value.clone())))
        .collect()
}

impl Endpoint {
    fn path_from(&self, input: &Value) -> Result<String> {
        let mut path = String::with_capacity(self.path.len());
        let mut offset = 0;
        for part in PLACEHOLDER.captures_iter(&self.path) {
            let key = &part[1];
            let token = part.get(0).context("missing endpoint placeholder")?;
            path.push_str(&self.path[offset..token.start()]);
            let value = input.get(key).with_context(|| {
                format!("Missing {key}. Next step: use the ID from the list tool.")
            })?;
            let value = value
                .as_str()
                .map_or_else(|| value.to_string(), str::to_owned);
            if key == "entity" {
                if !value.split('/').all(|segment| {
                    !segment.is_empty()
                        && segment.bytes().all(|c| c.is_ascii_lowercase() || c == b'_')
                }) {
                    bail!("Invalid entity. Next step: use the entity name shown in the API guide.");
                }
                path.push_str(&value);
            } else {
                path.push_str(&id_segment(&value)?);
            }
            offset = token.end();
        }
        path.push_str(&self.path[offset..]);
        Ok(path)
    }

    pub fn request<'a>(&'a self, input: &'a Value) -> Result<Request<'a>> {
        let mut query = select(input, &self.query);
        if self.list {
            query.insert(
                "page".into(),
                input.get("page").cloned().unwrap_or(json!(1)),
            );
            query.insert(
                "per_page".into(),
                input.get("per_page").cloned().unwrap_or(json!(30)),
            );
        }
        if (self.list || self.fields)
            && let Some(fields) = input["fields"].as_str().filter(|text| !text.is_empty())
        {
            query.insert("fields".into(), json!(fields));
        }
        let version = input["api_version"]
            .as_str()
            .or(self.version.as_deref())
            .or_else(|| {
                (self.price_tables_version
                    && input["aggregates"]
                        .as_str()
                        .is_some_and(|items| items.contains("price_tables")))
                .then_some("unstable")
            });
        let body = if let Some(key) = &self.body_key {
            input.get(key).cloned()
        } else {
            self.body.as_ref().map(|fields| {
                let mut body = select(input, fields);
                if let Some(extra) = input["additional_fields"].as_object() {
                    body.extend(extra.clone());
                }
                Value::Object(body)
            })
        };
        Ok(Request {
            method: &self.method,
            path: self.path_from(input)?,
            version,
            query: Value::Object(query),
            body,
        })
    }

    pub async fn invoke(&self, api: &Api, input: &Value) -> Result<CallToolResult> {
        let request = self.request(input)?;
        let page = request.query["page"].as_u64().unwrap_or(1);
        let per_page = request.query["per_page"].as_u64().unwrap_or(30);
        if self.name == "tiendanube_orders_list" && page.saturating_mul(per_page) > 10_000 {
            bail!(
                "Orders only allow page * per_page <= 10000. Next step: use since_id or date filters."
            );
        }
        if self.name.contains("external_invoices") && per_page > 50 {
            bail!("External invoices allow at most 50 items per page. Next step: lower per_page.");
        }
        let response = api
            .request(
                request.method,
                &request.path,
                request.version,
                &request.query,
                request.body.as_ref(),
            )
            .await;
        let payload = match response {
            Ok(response) if self.list => envelope(response.data, &response.headers, page, per_page),
            Ok(response) => response.data,
            Err(error)
                if self.list
                    && error.downcast_ref::<ApiError>().is_some_and(|api| {
                        api.status == 404
                            && api
                                .payload
                                .to_string()
                                .to_ascii_lowercase()
                                .contains("last page")
                    }) =>
            {
                envelope(
                    json!([]),
                    &reqwest::header::HeaderMap::new(),
                    page,
                    per_page,
                )
            }
            Err(error) => bail!("{}", format_error(&error, &self.scope)),
        };
        Ok(format::render(
            &payload,
            input["response_format"].as_str().unwrap_or("json"),
        )
        .into_result())
    }
}

fn envelope(items: Value, headers: &reqwest::header::HeaderMap, page: u64, per_page: u64) -> Value {
    let items = match items {
        Value::Array(items) => items,
        item => vec![item],
    };
    let total = headers
        .get("x-total-count")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse::<u64>().ok());
    let next_link = headers
        .get("link")
        .and_then(|value| value.to_str().ok())
        .is_some_and(|value| {
            value.split(';').any(|component| {
                component.trim_start().starts_with("rel=\"next\"")
                    || component.trim_start().starts_with("rel=next")
            })
        });
    let more = next_link
        || total.map_or(items.len() as u64 >= per_page, |total| {
            page.saturating_mul(per_page) < total
        });
    let mut result = json!({"count":items.len(),"page":page,"per_page":per_page});
    if let Some(total) = total {
        result["total"] = json!(total);
    }
    result["has_more"] = json!(more);
    if more {
        result["next_page"] = json!(page.saturating_add(1));
    }
    result["items"] = json!(items);
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn all_routes_match_the_typescript_reference() -> Result<()> {
        let fixtures: Vec<Value> =
            serde_json::from_str(include_str!("../tests/fixtures/requests.json"))?;
        assert_eq!(fixtures.len(), endpoints().len());
        for (fixture, endpoint) in fixtures.iter().zip(endpoints()) {
            assert_eq!(fixture["name"], endpoint.name);
            assert_eq!(
                serde_json::to_value(endpoint.request(&fixture["input"])?)?,
                fixture["request"],
                "{}",
                endpoint.name
            );
        }
        Ok(())
    }

    #[test]
    fn route_validation_blocks_encoded_path_separators_and_dot_segments() {
        for path in [
            "//external.test",
            "/products/%2e%2e",
            "/products/a%2fb",
            "/a/%252e",
            "/../products",
            "/products?secret=ab",
        ] {
            assert!(crate::client::validate_path(path).is_err(), "{path}");
        }
    }
}
