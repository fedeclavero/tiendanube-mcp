use std::collections::{HashMap, HashSet};
use std::fs::{self, OpenOptions};
use std::io::{Cursor, Read};
use std::path::PathBuf;
use std::str::FromStr;

use anyhow::{Context, Result, anyhow, bail, ensure};
use base64::{Engine as _, engine::general_purpose::STANDARD};
use image::{ImageFormat, ImageReader, Limits};
use rmcp::model::CallToolResult;
use rust_decimal::{Decimal, RoundingStrategy, prelude::ToPrimitive};
use serde_json::{Value, json};

use crate::client::{Api, format_error, id_segment};
use crate::format::{pretty, workflow_result};

const MAX_IMAGE_BYTES: usize = 10 * 1024 * 1024;
const MAX_IMAGE_SIDE: u32 = 8192;
const MAX_IMAGE_PIXELS: u32 = 16_777_216;
const MAX_IMAGE_MEMORY: u64 = 64 * 1024 * 1024;
const SUPPORTED_IMAGES: &str = "JPEG, PNG, GIF or WEBP";
const NULL: Value = Value::Null;
const STOCK_WARNING: &str = "A regular combo product does NOT deduct the components' stock when it sells. Combo stock was set to the scarcest component; keep it in sync, or create a native Kit in the admin panel (the API can only read Kits) if automatic deduction is required.";
const REMOTE_FILE: &str = "Local image files are only available through stdio. Next step: use the local MCP client, omit image_files to reuse component photos, or pass a public URL to tiendanube_product_images_create.";

struct ImageFile {
    bytes: Vec<u8>,
    filename: String,
    path: PathBuf,
}

fn text_of<'a>(value: &'a Value, lang: &str) -> &'a str {
    value
        .as_str()
        .or_else(|| {
            value
                .get(lang)
                .and_then(Value::as_str)
                .filter(|text| !text.is_empty())
        })
        .or_else(|| {
            value
                .as_object()?
                .values()
                .filter_map(Value::as_str)
                .find(|text| !text.is_empty())
        })
        .unwrap_or_default()
}

fn i18n(value: &Value, lang: &str) -> Value {
    match value.as_str() {
        Some(text) => json!({(lang): text}),
        None => value.clone(),
    }
}

fn escape_html(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

fn decimal(value: &Value) -> Option<Decimal> {
    let text = match value {
        Value::Number(number) => number.to_string(),
        Value::String(text) => text.trim().to_owned(),
        _ => return None,
    };
    Decimal::from_str(&text)
        .or_else(|_| Decimal::from_scientific(&text))
        .ok()
}

fn money(value: Decimal) -> String {
    format!(
        "{:.2}",
        value.round_dp_with_strategy(2, RoundingStrategy::MidpointAwayFromZero)
    )
}

fn id(value: &Value) -> Result<String> {
    let id = match value {
        Value::String(value) => value.to_owned(),
        Value::Number(number) if number.is_f64() => match number.as_f64() {
            Some(n) if n.fract() == 0.0 => format!("{n:.0}"),
            _ => number.to_string(),
        },
        Value::Number(number) => number.to_string(),
        _ => bail!(
            "Invalid product or variant ID. Next step: pick an ID with tiendanube_products_list."
        ),
    };
    ensure!(
        !id.trim().is_empty(),
        "Invalid product or variant ID. Next step: pick an ID with tiendanube_products_list."
    );
    Ok(id)
}

fn variant_label(variant: &Value, lang: &str) -> String {
    variant["values"]
        .as_array()
        .into_iter()
        .flatten()
        .map(|value| text_of(value, lang))
        .filter(|text| !text.is_empty())
        .collect::<Vec<_>>()
        .join(" / ")
}

fn expand_file_path(input: &str) -> Result<PathBuf> {
    let path = match input
        .strip_prefix("~/")
        .or_else(|| input.strip_prefix("~\\"))
    {
        Some(relative) => dirs::home_dir()
            .context("Can't determine the home directory. Next step: use the absolute image path.")?
            .join(relative),
        None => PathBuf::from(input),
    };
    let path = std::path::absolute(path)?;
    #[cfg(windows)]
    if !matches!(
        path.components().next(),
        Some(std::path::Component::Prefix(prefix)) if matches!(prefix.kind(),
            std::path::Prefix::Disk(_) | std::path::Prefix::VerbatimDisk(_))
    ) {
        bail!(
            "Use an image on a local drive. Next step: copy the image to this computer and pass its absolute path."
        );
    }
    Ok(path)
}

fn read_image_file(input: &str) -> Result<ImageFile> {
    let path = expand_file_path(input)?;
    let open_error = || {
        format!(
            "File not found or unreadable: {}\nNext step: save the image to disk first and pass its absolute path.",
            path.display()
        )
    };
    let metadata = fs::metadata(&path).with_context(open_error)?;
    ensure!(metadata.is_file(), "{}", open_error());
    ensure!(
        metadata.len() <= MAX_IMAGE_BYTES as u64,
        "Image is {:.1} MB; Tiendanube documents a limit of 10 MB.\nNext step: re-export it smaller (e.g. 1600x1600 JPG) and try again.",
        metadata.len() as f64 / 1048576.0
    );
    let mut options = OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.custom_flags(libc::O_NONBLOCK);
    }
    let file = options.open(&path).with_context(open_error)?;
    ensure!(
        file.metadata().with_context(open_error)?.is_file(),
        "{}",
        open_error()
    );
    let mut bytes = Vec::new();
    file.take((MAX_IMAGE_BYTES + 1) as u64)
        .read_to_end(&mut bytes)
        .with_context(open_error)?;
    ensure!(
        bytes.len() <= MAX_IMAGE_BYTES,
        "Image exceeds 10 MB. Next step: re-export it smaller and try again."
    );

    let format = match image::guess_format(&bytes) {
        Ok(
            format @ (ImageFormat::Jpeg | ImageFormat::Png | ImageFormat::Gif | ImageFormat::WebP),
        ) => format,
        _ => bail!(
            "{} is not a {SUPPORTED_IMAGES} image.\nNext step: export the picture as PNG or JPG and pass that file.",
            path.display()
        ),
    };
    let decode_error = || {
        anyhow!(
            "Image is corrupt or exceeds the decoding limit: {}. Next step: re-export it as a smaller PNG or JPG.",
            path.display()
        )
    };
    let dimensions = ImageReader::with_format(Cursor::new(&bytes), format)
        .into_dimensions()
        .map_err(|_| decode_error())?;
    let (width, height) = dimensions;
    if width > MAX_IMAGE_SIDE
        || height > MAX_IMAGE_SIDE
        || width
            .checked_mul(height)
            .is_none_or(|pixels| pixels == 0 || pixels > MAX_IMAGE_PIXELS)
    {
        return Err(decode_error());
    }
    let mut limits = Limits::default();
    limits.max_image_width = Some(MAX_IMAGE_SIDE);
    limits.max_image_height = Some(MAX_IMAGE_SIDE);
    limits.max_alloc = Some(MAX_IMAGE_MEMORY);
    let mut reader = ImageReader::with_format(Cursor::new(&bytes), format);
    reader.limits(limits);
    reader.decode().map_err(|_| decode_error())?;

    let filename = path
        .file_name()
        .and_then(|name| name.to_str())
        .context("The image filename must be UTF-8. Next step: rename the image and try again.")?;
    Ok(ImageFile {
        bytes,
        filename: filename.to_owned(),
        path,
    })
}

async fn load_files(paths: Vec<String>, local_files: bool) -> Result<Vec<ImageFile>> {
    if paths.is_empty() {
        return Ok(Vec::new());
    }
    ensure!(local_files, "{REMOTE_FILE}");
    tokio::task::spawn_blocking(move || paths.iter().map(|path| read_image_file(path)).collect())
        .await
        .context("Image decoding did not finish")?
}

async fn upload_image(
    api: &Api,
    product_id: &Value,
    img: &ImageFile,
    position: Option<&Value>,
    alt: Option<&Value>,
) -> Result<Value> {
    let path = format!("/products/{}/images", id_segment(&id(product_id)?)?);
    let mut body = json!({
        "attachment": STANDARD.encode(&img.bytes),
        "filename": img.filename
    });
    if let Some(position) = position {
        body["position"] = position.clone();
    }
    if let Some(alt) = alt {
        body["alt"] = alt.clone();
    }
    api.request("POST", &path, None, &NULL, Some(&body))
        .await
        .map(|response| response.data)
        .map_err(|error| anyhow!(format_error(&error, "write_products")))
}

async fn add_image(api: &Api, input: &Value, local_files: bool) -> Result<CallToolResult> {
    let path = input["file_path"]
        .as_str()
        .context("file_path must be a path to a local image")?;
    let mut files = load_files(vec![path.to_owned()], local_files).await?;
    let img = files.pop().context("No image was loaded")?;
    let product_id = &input["product_id"];
    let image = upload_image(
        api,
        product_id,
        &img,
        input.get("position"),
        input.get("alt"),
    )
    .await?;
    Ok(workflow_result(
        format!(
            "Uploaded {} ({:.0} KB) to product {}.\n{}",
            img.filename,
            img.bytes.len() as f64 / 1024.0,
            id(product_id)?,
            pretty(&image)
        ),
        json!({"image": image}),
    ))
}

struct Part {
    product_id: Value,
    variant_id: Value,
    name: String,
    variant_label: String,
    quantity: u64,
    unit: Decimal,
    stock: Option<u64>,
    weight: Option<Decimal>,
    src: Option<String>,
}

fn choose_variant<'a>(
    product: &'a Value,
    requested: Option<&Value>,
    product_key: &str,
    lang: &str,
) -> Result<&'a Value> {
    let variants = product["variants"]
        .as_array()
        .map_or(&[][..], Vec::as_slice);
    let selected = match requested {
        Some(requested) => {
            let requested = id(requested)?;
            variants
                .iter()
                .find(|variant| id(&variant["id"]).ok().as_deref() == Some(requested.as_str()))
        }
        None if variants.len() == 1 => variants.first(),
        _ => None,
    };
    if let Some(selected) = selected {
        return Ok(selected);
    }
    let options = variants
        .iter()
        .map(|variant| {
            let mut label = variant_label(variant, lang);
            if label.is_empty() {
                label = text_of(&variant["sku"], lang).to_owned();
            }
            if label.is_empty() {
                label.push('?');
            }
            format!(
                "{} ({label}, price {})",
                id(&variant["id"]).unwrap_or_default(),
                text_of(&variant["price"], lang)
            )
        })
        .collect::<Vec<_>>()
        .join("; ");
    if let Some(requested) = requested {
        bail!(
            "Error: variant {} does not belong to product {product_key}. Variants: {options}\nNext step: call again with one of those variant_id values.",
            id(requested)?
        );
    }
    bail!(
        "Error: product {product_key} (\"{}\") has {} variants, so variant_id is required. Variants: {options}\nNext step: call again adding \"variant_id\" to that component.",
        text_of(&product["name"], lang),
        variants.len()
    )
}

fn currency_sum(amounts: impl IntoIterator<Item = (Decimal, u64)>) -> Result<Decimal> {
    amounts
        .into_iter()
        .try_fold(Decimal::ZERO, |total, (amount, count)| {
            total.checked_add(amount.checked_mul(Decimal::from(count))?)
        })
        .context("Combo values exceed their range. Next step: check the component amounts and quantities.")
}

fn count(value: &Value) -> Option<u64> {
    let number = decimal(value)?;
    number
        .fract()
        .is_zero()
        .then(|| number.max(Decimal::ZERO).to_u64())
        .flatten()
}

fn compute_stock(parts: &[Part]) -> Value {
    let mut stock_by_variant = HashMap::new();
    for part in parts {
        if let Some(stock) = part.stock {
            let entry = stock_by_variant
                .entry((part.product_id.to_string(), part.variant_id.to_string()))
                .or_insert((stock, 0));
            entry.1 += part.quantity;
        }
    }
    let computed = stock_by_variant
        .values()
        .map(|(stock, count)| stock / count)
        .min();
    json!(computed)
}

async fn create_combo(api: &Api, input: &Value, local_files: bool) -> Result<CallToolResult> {
    let files = input["image_files"]
        .as_array()
        .map_or_else(Vec::new, |values| {
            values
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_owned)
                .collect()
        });
    let image_files = load_files(files, local_files).await?;
    let store = api
        .request(
            "GET",
            "/store",
            None,
            &json!({"fields":"languages,main_language"}),
            None,
        )
        .await
        .map_err(|error| anyhow!(format_error(&error, "read_products")))?
        .data;
    let lang = store["main_language"]
        .as_str()
        .filter(|value| !value.is_empty())
        .or_else(|| store["languages"].get(0)?.as_str())
        .filter(|value| !value.is_empty())
        .unwrap_or("es");

    let components = input["components"]
        .as_array()
        .context("components must be an array")?;
    let mut cache = HashMap::new();
    let mut parts = Vec::new();
    for component in components {
        let key = id(&component["product_id"])?;
        let product = match cache.entry(key.clone()) {
            std::collections::hash_map::Entry::Occupied(entry) => entry.into_mut(),
            std::collections::hash_map::Entry::Vacant(entry) => {
                let path = format!("/products/{}", id_segment(&key)?);
                let product = api
                    .request(
                        "GET",
                        &path,
                        None,
                        &json!({"fields":"id,name,variants,images"}),
                        None,
                    )
                    .await
                    .map_err(|error| anyhow!(format_error(&error, "read_products")))?
                    .data;
                entry.insert(product)
            }
        };
        let variant = choose_variant(product, component.get("variant_id"), &key, lang)?;
        let unit = decimal(&variant["promotional_price"])
            .filter(|price| *price > Decimal::ZERO)
            .or_else(|| decimal(&variant["price"]))
            .filter(|price| *price >= Decimal::ZERO)
            .ok_or_else(|| anyhow!(
                "Error: variant {} of product {key} has no price.\nNext step: set its price with tiendanube_variants_update or pick another variant.",
                id(&variant["id"]).unwrap_or_default()
            ))?;

        parts.push(Part {
            product_id: product["id"].clone(),
            variant_id: variant["id"].clone(),
            name: text_of(&product["name"], lang).to_owned(),
            variant_label: variant_label(variant, lang),
            quantity: count(&component["quantity"])
                .filter(|&count| count > 0)
                .unwrap_or(1),
            unit,
            stock: (variant["stock_management"] != false)
                .then(|| count(&variant["stock"]))
                .flatten(),
            weight: decimal(&variant["weight"]).filter(|weight| *weight >= Decimal::ZERO),
            src: product["images"]
                .get(0)
                .and_then(|photo| photo["src"].as_str())
                .filter(|src| !src.is_empty())
                .map(str::to_owned),
        });
    }

    let list_price = currency_sum(parts.iter().map(|part| (part.unit, part.quantity)))?;
    let discount = decimal(&input["discount_percent"]).unwrap_or_default();
    let price = if let Some(price) = input.get("price") {
        decimal(price)
    } else {
        let rate = discount.checked_div(Decimal::from(100));
        rate.and_then(|rate| Decimal::ONE.checked_sub(rate))
            .and_then(|exposure| list_price.checked_mul(exposure))
    };
    let price = price.filter(|price| price.round_dp_with_strategy(2, RoundingStrategy::MidpointAwayFromZero) > Decimal::ZERO).ok_or_else(|| anyhow!(
        "Error: the combo price is not a positive number in cents.\nNext step: pass a valid 'price' or check the component prices."
    ))?;
    let stock = input
        .get("stock")
        .cloned()
        .unwrap_or_else(|| compute_stock(&parts));
    let weight = if parts.iter().all(|part| part.weight.is_some()) {
        let weight = currency_sum(
            parts
                .iter()
                .filter_map(|part| Some((part.weight?, part.quantity))),
        )?;
        (weight > Decimal::ZERO).then(|| {
            weight
                .round_dp_with_strategy(3, RoundingStrategy::MidpointAwayFromZero)
                .normalize()
                .to_string()
        })
    } else {
        None
    };

    let name = i18n(&input["name"], lang);
    let description = if let Some(description) = input.get("description") {
        i18n(description, lang)
    } else {
        let included = parts
            .iter()
            .map(|part| {
                let name = escape_html(&part.name);
                let detail = if part.variant_label.is_empty() {
                    String::new()
                } else {
                    format!(" ({})", escape_html(&part.variant_label))
                };
                format!("<li>{} x {name}{detail}</li>", part.quantity)
            })
            .collect::<String>();
        json!({(lang): format!("<p>Incluye:</p><ul>{included}</ul>")})
    };
    let sku = input["sku"].as_str().map_or_else(
        || {
            let ids = parts
                .iter()
                .map(|part| id(&part.product_id))
                .collect::<Result<Vec<_>>>()?;
            Ok::<String, anyhow::Error>(
                format!("COMBO-{}", ids.join("-"))
                    .chars()
                    .take(60)
                    .collect(),
            )
        },
        |sku| Ok(sku.to_owned()),
    )?;
    let published = input["published"].as_bool().unwrap_or(false);
    let dry_run = input["dry_run"].as_bool().unwrap_or(false);
    let mut variant = json!({
        "price": money(price),
        "stock_management": !stock.is_null(),
        "stock": stock,
        "sku": sku
    });
    if let Some(weight) = &weight {
        variant["weight"] = json!(weight);
    }
    let mut body = json!({
        "name": name,
        "description": description,
        "published": published,
        "variants": [variant]
    });
    if let Some(categories) = input["category_ids"]
        .as_array()
        .filter(|items| !items.is_empty())
    {
        body["categories"] = json!(categories);
    }
    if image_files.is_empty() && input["use_component_images"].as_bool().unwrap_or(true) {
        let mut seen = HashSet::new();
        let images: Vec<_> = parts
            .iter()
            .filter_map(|part| part.src.as_deref())
            .filter(|src| seen.insert(*src))
            .take(9)
            .enumerate()
            .map(|(index, src)| json!({"src":src,"position": index + 1}))
            .collect();
        if !images.is_empty() {
            body["images"] = json!(images);
        }
    }

    let mut warnings = vec![STOCK_WARNING];
    if list_price > Decimal::ZERO
        && price >= list_price
        && input.get("price").is_none()
        && discount.is_zero()
    {
        warnings.push("No discount was applied: price equals the sum of the components. Pass discount_percent to make the combo attractive.");
    }
    if !published {
        warnings.push(if dry_run {
            "If created, the combo will be a DRAFT (not visible in the store)."
        } else {
            "Created as a DRAFT (not visible in the store)."
        });
    }
    let plan_parts: Vec<_> = parts
        .iter()
        .map(|part| {
            json!({
                "product_id": part.product_id,
                "variant_id": part.variant_id,
                "name": part.name,
                "quantity": part.quantity,
                "unit_price": money(part.unit)
            })
        })
        .collect();
    let mut plan = json!({
        "name": name,
        "price": money(price),
        "list_price_sum": money(list_price),
        "stock": stock,
    });
    if let Some(weight) = weight {
        plan["weight_kg"] = json!(weight);
    }
    plan["components"] = json!(plan_parts);

    if dry_run {
        let mut preview = plan.clone();
        preview["request_body"] = body;
        preview["warnings"] = json!(warnings);
        let mut result = json!({"dry_run": true});
        if let (Some(result), Some(plan)) = (result.as_object_mut(), plan.as_object()) {
            result.extend(plan.clone());
        }
        result["warnings"] = json!(warnings);
        return Ok(workflow_result(
            format!("DRY RUN (nothing created):\n{}", pretty(&preview)),
            result,
        ));
    }

    let created = api
        .request("POST", "/products", None, &NULL, Some(&body))
        .await
        .map_err(|error| anyhow!(format_error(&error, "write_products")))?
        .data;
    let created_id = &created["id"];
    if let Err(error) = id(created_id) {
        return Err(error.context(
            "Tiendanube did not return a usable ID after creation. Next step: verify the published and draft product list before trying again.",
        ));
    }
    let item = created_id.to_string();
    let mut images_uploaded = 0;
    let mut image_errors = Vec::new();
    for (index, file) in image_files.into_iter().enumerate() {
        match upload_image(api, created_id, &file, Some(&json!(index + 1)), None).await {
            Ok(_) => images_uploaded += 1,
            Err(error) => image_errors.push(format!("{}: {error}", file.path.display())),
        }
    }

    let mut next = vec![if published {
        "The combo is live.".to_owned()
    } else {
        format!(
            "Ask the user if you should publish it, then: tiendanube_products_update {{\"id\":{item},\"published\":true}}."
        )
    }];
    if !image_errors.is_empty() {
        next.push(format!("Some images failed to upload; fix and retry with tiendanube_product_image_add_from_file {{\"product_id\":{item},\"file_path\":\"...\"}}."));
    }
    let mut summary = json!({
        "id": created_id,
        "name": text_of(&created["name"], lang),
        "handle": text_of(&created["handle"], lang)
    });
    for key in ["published", "canonical_url"] {
        if let Some(value) = created.get(key) {
            summary[key] = value.clone();
        }
    }
    let mut result = json!({"created": summary});
    if let (Some(result), Some(plan)) = (result.as_object_mut(), plan.as_object()) {
        result.extend(plan.clone());
    }
    result["images_uploaded"] = json!(images_uploaded);
    result["image_errors"] = json!(image_errors);
    result["warnings"] = json!(warnings);
    result["next_steps"] = json!(next);
    let state = if published { "published" } else { "draft" };
    let stock = if stock.is_null() {
        "unlimited".to_owned()
    } else {
        stock.to_string()
    };
    Ok(workflow_result(
        format!(
            "Combo created (id {}, {state}) at price {}, stock {stock}.\n{}",
            id(created_id)?,
            money(price),
            pretty(&result)
        ),
        result,
    ))
}

pub async fn call(
    api: &Api,
    name: &str,
    input: &Value,
    local_files: bool,
) -> Result<CallToolResult> {
    match name {
        "tiendanube_create_combo" => create_combo(api, input, local_files).await,
        "tiendanube_product_image_add_from_file" => add_image(api, input, local_files).await,
        _ => bail!("Unknown workflow: {name}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{Json, Router, extract::Request, response::IntoResponse, routing::any};
    use std::path::Path;
    use std::sync::{Arc, Mutex};

    type Calls = Arc<Mutex<Vec<(String, String, Value)>>>;

    async fn mock_store(fail_images: bool) -> (Api, Calls, tokio::task::JoinHandle<()>) {
        let calls = Calls::default();
        let captured = calls.clone();
        let router = Router::new().route(
            "/{*path}",
            any(move |request: Request| {
                let captured = captured.clone();
                async move {
                    assert_eq!(request.headers()["authorization"], "Bearer fixture");
                    let method = request.method().to_string();
                    let path = request.uri().path().to_owned();
                    let bytes = axum::body::to_bytes(request.into_body(), MAX_IMAGE_BYTES * 2)
                        .await
                        .unwrap();
                    let body: Value = serde_json::from_slice(&bytes).unwrap_or_default();
                    captured
                        .lock()
                        .unwrap()
                        .push((method.clone(), path.clone(), body.clone()));
                    let product = |id, name, price, stock, weight, image| {
                        json!({"id":id,"name":{"es":name},"images":[{"src":image}],"variants":[
                            {"id":id * 10 + 1,"price":price,"stock":stock,"stock_management":true,"weight":weight}
                        ]})
                    };
                    let (status, json) = match (method.as_str(), path.as_str()) {
                        ("GET", "/2025-03/42/store") => {
                            (200, json!({"languages":["es"],"main_language":"es"}))
                        }
                        ("GET", "/2025-03/42/products/111") => (
                            200,
                            product(111, "Remera <S>", "10000.00", 10, "0.3", "https://cdn/r.jpg"),
                        ),
                        ("GET", "/2025-03/42/products/222") => (
                            200,
                            product(222, "Gorra", "4000.00", 7, "0.2", "https://cdn/g.jpg"),
                        ),
                        ("POST", "/2025-03/42/products") => (
                            201,
                            json!({"id":900, "name":body["name"], "published":false, "handle":{"es":"combo"}}),
                        ),
                        ("POST", "/2025-03/42/products/900/images") if fail_images => {
                            (422, json!({"message":"Rejected fixture image"}))
                        }
                        ("POST", "/2025-03/42/products/900/images") => (
                            201,
                            json!({"id":5, "src":"https://cdn/c.png"}),
                        ),
                        _ => (404, json!({"message":"fixture endpoint not found"})),
                    };
                    (axum::http::StatusCode::from_u16(status).unwrap(), Json(json)).into_response()
                }
            }),
        );
        let listener = tokio::net::TcpListener::bind(("127.0.0.1", 0))
            .await
            .unwrap();
        let origin = format!("http://{}", listener.local_addr().unwrap());
        let server = tokio::spawn(async { axum::serve(listener, router).await.unwrap() });
        (Api::mock(&origin, "fixture"), calls, server)
    }

    fn png(path: &Path) {
        image::RgbaImage::from_pixel(2, 2, image::Rgba([10, 60, 200, 255]))
            .save_with_format(path, ImageFormat::Png)
            .unwrap();
    }

    #[tokio::test]
    async fn plans_without_writing_and_creates_a_draft_with_verified_image() {
        let (api, calls, server) = mock_store(false).await;
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("combo con ñ.png");
        png(&path);
        let input = json!({
            "name":"Combo Verano",
            "components":[{"product_id":111,"quantity":1},{"product_id":"222","quantity":2}],
            "discount_percent":10,"image_files":[path],"dry_run":true
        });
        let name = "tiendanube_create_combo";
        let result = call(&api, name, &input, true)
            .await
            .unwrap()
            .structured_content
            .unwrap();
        assert_eq!(result["price"], "16200.00");
        assert_eq!(result["stock"], 3);
        assert_eq!(result["weight_kg"], "0.7");
        assert!(
            calls
                .lock()
                .unwrap()
                .iter()
                .all(|(method, _, _)| method == "GET")
        );
        let mut input = input;
        input["dry_run"] = json!(false);
        let result = call(&api, name, &input, true)
            .await
            .unwrap()
            .structured_content
            .unwrap();
        assert_eq!(result["created"]["published"], false);
        assert_eq!(result["images_uploaded"], 1);
        let calls = calls.lock().unwrap();
        let posts: Vec<_> = calls
            .iter()
            .filter(|(method, _, _)| method == "POST")
            .collect();
        assert_eq!(posts.len(), 2);
        assert_eq!(posts[0].2["published"], false);
        assert_eq!(posts[0].2["variants"][0]["price"], "16200.00");
        assert!(
            posts[0].2["description"]["es"]
                .as_str()
                .unwrap()
                .contains("Remera &lt;S&gt;")
        );
        assert_eq!(posts[1].1, "/2025-03/42/products/900/images");
        assert_eq!(posts[1].2["filename"], "combo con ñ.png");
        assert_eq!(
            STANDARD
                .decode(posts[1].2["attachment"].as_str().unwrap())
                .unwrap(),
            fs::read(path).unwrap()
        );
        server.abort();
    }

    #[tokio::test]
    async fn rejects_corrupt_images_and_remote_file_paths_before_any_api_request() {
        let (api, calls, server) = mock_store(false).await;
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("pretends-to-be-an-image.png");
        fs::write(&path, b"\x89PNG\r\n\x1a\nprivate text").unwrap();
        let input =
            json!({"name":"Fixture","components":[{"product_id":111}],"image_files":[path]});
        let corrupt = call(&api, "tiendanube_create_combo", &input, true)
            .await
            .unwrap_err();
        assert!(corrupt.to_string().contains("corrupt"));
        let blocked = call(&api, "tiendanube_create_combo", &input, false)
            .await
            .unwrap_err();
        assert_eq!(blocked.to_string(), REMOTE_FILE);
        let upload = json!({"product_id": 900, "file_path": path});
        assert_eq!(
            call(
                &api,
                "tiendanube_product_image_add_from_file",
                &upload,
                false
            )
            .await
            .unwrap_err()
            .to_string(),
            REMOTE_FILE
        );
        assert!(calls.lock().unwrap().is_empty());
        server.abort();
    }

    #[tokio::test]
    async fn counts_duplicate_variants_together_and_reports_partial_image_failure() {
        let (api, calls, server) = mock_store(true).await;
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("combo.png");
        png(&path);
        let input = json!({
            "name":"Fixture",
            "components":[{"product_id":111,"quantity":4},{"product_id":"111","variant_id":1111,"quantity":3}],
            "image_files":[path]
        });
        let result = call(&api, "tiendanube_create_combo", &input, true)
            .await
            .unwrap()
            .structured_content
            .unwrap();
        assert_eq!(result["stock"], 1);
        assert_eq!(result["created"]["id"], 900);
        assert_eq!(result["images_uploaded"], 0);
        assert_eq!(result["image_errors"].as_array().unwrap().len(), 1);
        assert!(
            result["next_steps"][1]
                .as_str()
                .unwrap()
                .contains("tiendanube_product_image_add_from_file")
        );
        let calls = calls.lock().unwrap();
        assert_eq!(
            calls
                .iter()
                .filter(|(method, path, _)| method == "GET" && path.ends_with("/111"))
                .count(),
            1
        );
        assert_eq!(
            calls
                .iter()
                .filter(|(method, path, _)| method == "POST" && path.ends_with("/products"))
                .count(),
            1
        );
        server.abort();
    }
}
