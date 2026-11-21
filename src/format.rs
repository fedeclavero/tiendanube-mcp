use std::fmt::Write;

use rmcp::model::{CallToolResult, ContentBlock};
use serde_json::{Value, json};

const CHARACTER_LIMIT: usize = 25_000;

pub struct Rendered {
    pub text: String,
    pub structured: Value,
}

impl Rendered {
    pub fn into_result(self) -> CallToolResult {
        let mut result = CallToolResult::success(vec![ContentBlock::text(self.text)]);
        result.structured_content = Some(self.structured);
        result
    }
}

fn scalar(value: &Value) -> String {
    match value {
        Value::String(s) => s.clone(),
        Value::Array(values) => values
            .iter()
            .map(|value| {
                if value.is_null() {
                    String::new()
                } else {
                    scalar(value)
                }
            })
            .collect::<Vec<_>>()
            .join(","),
        Value::Object(_) => "[object Object]".to_owned(),
        _ => value.to_string(),
    }
}

fn label(value: &Value) -> String {
    let maybe_name = ["name", "title", "code", "email", "number"]
        .iter()
        .filter_map(|key| value.get(key))
        .find(|name| !name.is_null());
    let name = match maybe_name {
        Some(Value::Object(fields)) => fields.values().find(|name| name.is_string()),
        Some(Value::Array(items)) => items.iter().find(|name| name.is_string()),
        other => other,
    };
    let id = value
        .get("id")
        .filter(|id| !id.is_null())
        .or_else(|| value.get("key"));
    match (name, id) {
        (Some(name), Some(id)) => format!("{} ({})", scalar(name), scalar(id)),
        (Some(name), None) => scalar(name),
        (None, Some(id)) => format!("#{}", scalar(id)),
        (None, None) => "item".to_owned(),
    }
}

fn markdown(value: &Value, depth: usize, output: &mut String) {
    let pad = "  ".repeat(depth);
    if !(value.is_array() || value.is_object()) {
        let _ = write!(output, "{pad}{}", scalar(value));
        return;
    }
    if depth > 5 {
        let _ = write!(output, "{pad}{value}");
        return;
    }
    match value {
        Value::Array(values) if !values.is_empty() => {
            for (index, item) in values.iter().enumerate() {
                if index != 0 {
                    output.push('\n');
                }
                if item.is_array() || item.is_object() {
                    let _ = writeln!(output, "{pad}- **{}**", label(item));
                    markdown(item, depth + 1, output);
                } else {
                    let _ = write!(output, "{pad}- {}", scalar(item));
                }
            }
        }
        Value::Object(fields) if !fields.is_empty() => {
            for (index, (field, entry)) in fields.iter().enumerate() {
                if index != 0 {
                    output.push('\n');
                }
                let _ = write!(output, "{pad}- **{field}**:");
                if entry.is_array() || entry.is_object() {
                    output.push('\n');
                    markdown(entry, depth + 1, output);
                } else {
                    let _ = write!(output, " {}", scalar(entry));
                }
            }
        }
        _ => {
            let _ = write!(output, "{pad}(empty)");
        }
    }
}

pub fn pretty(data: &Value) -> String {
    serde_json::to_string_pretty(data).unwrap_or_else(|_| data.to_string())
}

fn as_text(data: &Value, format: &str) -> String {
    if format == "markdown" {
        let mut text = String::new();
        markdown(data, 0, &mut text);
        text
    } else {
        pretty(data)
    }
}

fn bounded(mut text: String, notice: &str) -> String {
    let mut remaining = CHARACTER_LIMIT;
    for (index, character) in text.char_indices() {
        if let Some(next) = remaining.checked_sub(character.len_utf16()) {
            remaining = next;
        } else {
            text.truncate(index);
            text.push_str(notice);
            break;
        }
    }
    text
}

fn to_structured(data: &Value) -> Value {
    match data {
        Value::Object(_) => data.clone(),
        Value::Array(_) => json!({"items": data}),
        _ => json!({"result": data}),
    }
}

pub fn render(data: &Value, format: &str) -> Rendered {
    let mut text = as_text(data, format);
    let mut structured = to_structured(data);
    if text.encode_utf16().count() > CHARACTER_LIMIT
        && let Some(items) = data.get("items").and_then(Value::as_array)
        && items.len() > 1
    {
        let mut list = data.clone();
        let mut count = items.len();
        while count > 1 && text.encode_utf16().count() > CHARACTER_LIMIT {
            count /= 2;
            list["items"] = json!(items[..count]);
            text = as_text(&list, format);
        }
        list["count"] = json!(count);
        list["truncated"] = json!(true);
        list["truncation_message"] = json!(format!(
            "Response truncated from {} to {count} items. Use a smaller per_page, the 'fields' parameter, or more filters to narrow the result.",
            items.len()
        ));
        text = as_text(&list, format);
        structured = list;
    }
    Rendered {
        text: bounded(
            text,
            "\n\n[Output truncated. Use the 'fields' parameter to request fewer fields or add filters.]",
        ),
        structured,
    }
}

pub fn workflow_result(text: String, structured: Value) -> CallToolResult {
    Rendered {
        text: bounded(text, "\n[Output truncated: use filters or a smaller scope]"),
        structured,
    }
    .into_result()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn renders_nested_markdown_and_wraps_arrays() {
        let data = json!([{"id": 1, "name": {"es": "Gorra"}, "stock": 4}, "text"]);
        let result = render(&data, "markdown");
        assert_eq!(
            result.text,
            "- **Gorra (1)**\n  - **id**: 1\n  - **name**:\n    - **es**: Gorra\n  - **stock**: 4\n- text"
        );
        assert_eq!(result.structured, json!({"items": data}));
        assert_eq!(
            render(&json!(null), "json").structured,
            json!({"result": null})
        );
    }

    #[test]
    fn bounds_utf16_without_splitting_non_bmp_characters() {
        let border = format!("{}😀next", "á".repeat(CHARACTER_LIMIT - 1));
        let display = render(&json!(border), "markdown").text;
        assert!(display.ends_with(
            "[Output truncated. Use the 'fields' parameter to request fewer fields or add filters.]"
        ));
        assert!(!display.contains('😀'));
    }

    #[test]
    fn truncates_items_in_structured_responses_too() {
        let item = json!({"handle": "ab".repeat(3000)});
        let data = json!({"count": 10, "page": 1, "per_page": 10, "has_more": true, "items": vec![item; 10]});
        let result = render(&data, "json");
        assert_eq!(result.structured["count"], json!(2));
        assert_eq!(result.structured["items"].as_array().map(Vec::len), Some(2));
        assert_eq!(result.structured["truncated"], true);
        assert!(result.text.encode_utf16().count() < CHARACTER_LIMIT);
    }
}
