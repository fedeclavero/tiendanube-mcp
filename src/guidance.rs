use std::collections::{HashMap, HashSet};
use std::sync::LazyLock;

use rmcp::model::CallToolResult;
use serde::Deserialize;
use serde_json::{Value, json};
use unicode_normalization::UnicodeNormalization;

use crate::{catalog, format};

#[derive(Deserialize)]
struct Recipe {
    id: String,
    title: String,
    triggers: Vec<String>,
    steps: Vec<String>,
    #[serde(default)]
    notes: Vec<String>,
}

#[derive(Deserialize)]
struct SearchTool {
    name: String,
    description: String,
    method: String,
}

#[derive(Deserialize)]
struct Guidance {
    recipes: Vec<Recipe>,
    start: String,
    instructions: String,
    resources: HashMap<String, String>,
    synonyms: HashMap<String, String>,
    stopwords: HashSet<String>,
    examples: HashSet<String>,
    custom: Vec<SearchTool>,
}

static DATA: LazyLock<Guidance> = LazyLock::new(|| {
    serde_json::from_str(include_str!("data/guidance.json")).expect("embedded MCP guidance")
});
static SEARCH_TOOLS: LazyLock<Vec<SearchTool>> = LazyLock::new(|| {
    DATA.custom
        .iter()
        .map(|t| SearchTool {
            name: t.name.clone(),
            description: t.description.clone(),
            method: t.method.clone(),
        })
        .chain(catalog::endpoints().iter().map(|e| SearchTool {
            name: e.name.clone(),
            description: format!("{}. {}", e.title, e.description),
            method: e.method.clone(),
        }))
        .collect()
});

pub fn instructions() -> &'static str {
    &DATA.instructions
}

pub fn start() -> CallToolResult {
    let recipes: Vec<_> = DATA
        .recipes
        .iter()
        .map(|r| json!({"id":r.id,"title":r.title}))
        .collect();
    format::workflow_result(DATA.start.clone(), json!({"recipes":recipes}))
}

fn normalize(text: &str) -> String {
    text.to_lowercase()
        .nfd()
        .filter(|ch| !('\u{0300}'..='\u{036f}').contains(ch))
        .collect()
}

fn stem(word: &str) -> String {
    if word.len() > 4
        && let Some(plural) = word.strip_suffix("ies")
    {
        return format!("{plural}y");
    }
    if word.len() > 3
        && let Some(singular) = word.strip_suffix('s')
    {
        return singular.to_owned();
    }
    word.to_owned()
}

fn words(text: &str) -> impl Iterator<Item = &str> {
    text.split(|c: char| !c.is_ascii_alphanumeric())
        .filter(|word| !word.is_empty())
}

fn query_words(query: &str) -> HashSet<String> {
    let plain = normalize(query);
    words(&plain)
        .filter(|word| word.len() > 2 && !DATA.stopwords.contains(*word))
        .map(|word| stem(DATA.synonyms.get(word).map_or(word, String::as_str)))
        .collect()
}

fn search_recipes(query: &str) -> Vec<&'static Recipe> {
    let plain = normalize(query);
    let inputs = query_words(query);
    let mut matches: Vec<_> = DATA
        .recipes
        .iter()
        .filter_map(|recipe| {
            let mut score = 0;
            for trigger in &recipe.triggers {
                let trigger = normalize(trigger);
                if plain.contains(&trigger) {
                    score += 4;
                } else if words(&trigger).map(stem).any(|word| inputs.contains(&word)) {
                    score += 1;
                }
            }
            if words(&normalize(&recipe.title))
                .map(stem)
                .any(|word| inputs.contains(&word))
            {
                score += 1;
            }
            (score > 0).then_some((score, recipe))
        })
        .collect();
    matches.sort_by_key(|(score, _)| std::cmp::Reverse(*score));
    matches
        .into_iter()
        .take(3)
        .map(|(_, recipe)| recipe)
        .collect()
}

pub fn find(query: &str) -> CallToolResult {
    let inputs = query_words(query);
    let mut matches: Vec<_> = SEARCH_TOOLS
        .iter()
        .filter_map(|tool| {
            let name = normalize(&tool.name);
            let parts: Vec<_> = name
                .trim_start_matches("tiendanube_")
                .split('_')
                .map(stem)
                .collect();
            let desc: HashSet<_> = words(&normalize(&tool.description)).map(stem).collect();
            let mut score = 0;
            for word in &inputs {
                if parts.contains(word) {
                    score += 5;
                } else if word.len() >= 4 && parts.iter().any(|p| p.starts_with(word)) {
                    score += 3;
                }
                if desc.contains(word) {
                    score += 1;
                }
            }
            if score > 0 && DATA.examples.contains(&tool.name) {
                score += 1;
            }
            (score > 0).then_some((score, tool))
        })
        .collect();
    // English locale sorting compares underscore before ASCII letters.
    matches.sort_by(|(left, a), (right, b)| right.cmp(left).then(a.name.cmp(&b.name)));
    let tools: Vec<_> = matches.into_iter().take(8).map(|(_, tool)| tool).collect();
    let recipes = search_recipes(query);
    let mut lines = vec![format!("# Tools for: {query}")];
    if tools.is_empty() {
        lines
            .push("- (no direct match: try different words, or use tiendanube_api_request)".into());
    } else {
        lines.extend(tools.iter().map(|t| {
            format!(
                "- {} [{}]: {}",
                t.name,
                t.method,
                t.description
                    .lines()
                    .next()
                    .unwrap_or_default()
                    .chars()
                    .take(200)
                    .collect::<String>()
            )
        }));
    }
    if !recipes.is_empty() {
        lines.extend([
            "".into(),
            "Recipes (call tiendanube_get_recipe with the id):".into(),
        ]);
        lines.extend(recipes.iter().map(|r| format!("- {}: {}", r.id, r.title)));
    }
    lines.extend(["".into(),"Tip: read a tool's description for its exact arguments. Example arguments are included for the main tools.".into()]);
    let tools: Vec<_> = tools.iter().map(|t| &t.name).collect();
    let recipes: Vec<_> = recipes.iter().map(|r| &r.id).collect();
    format::workflow_result(lines.join("\n"), json!({"tools":tools,"recipes":recipes}))
}

fn recipe_text(recipe: &Recipe) -> String {
    let mut lines = vec![
        format!("# Recipe \"{}\": {}", recipe.id, recipe.title),
        String::new(),
    ];
    lines.extend(
        recipe
            .steps
            .iter()
            .enumerate()
            .map(|(i, step)| format!("{}. {step}", i + 1)),
    );
    if !recipe.notes.is_empty() {
        lines.extend(["".into(), "Notes:".into()]);
        lines.extend(recipe.notes.iter().map(|note| format!("- {note}")));
    }
    lines.join("\n")
}

pub fn recipe(input: &Value) -> CallToolResult {
    let by_id = input["id"].as_str().and_then(|id| {
        DATA.recipes
            .iter()
            .find(|r| r.id.eq_ignore_ascii_case(id.trim()))
    });
    let picked = by_id.or_else(|| {
        input["query"]
            .as_str()
            .and_then(|q| search_recipes(q).first().copied())
    });
    if let Some(recipe) = picked {
        return format::workflow_result(
            recipe_text(recipe),
            json!({"id":recipe.id,"steps":recipe.steps}),
        );
    }
    let list = DATA
        .recipes
        .iter()
        .map(|r| format!("- {}: {}", r.id, r.title))
        .collect::<Vec<_>>()
        .join("\n");
    let ids: Vec<_> = DATA.recipes.iter().map(|r| &r.id).collect();
    format::workflow_result(
        format!("Available recipes:\n{list}\n\nCall again with {{\"id\":\"<recipe id>\"}}."),
        json!({"recipes":ids}),
    )
}

pub fn resource(uri: &str) -> Option<String> {
    match uri {
        "tiendanube://guide/start-here" => Some(format!("{}\n\n{}", DATA.instructions, DATA.start)),
        "tiendanube://guide/recipes" => Some(
            DATA.recipes
                .iter()
                .map(recipe_text)
                .collect::<Vec<_>>()
                .join("\n\n---\n\n"),
        ),
        uri => DATA.resources.get(uri).cloned(),
    }
}

pub fn tool_reference() -> String {
    let mut text =
        String::from("# Tiendanube MCP tools\n\nGenerated by `tiendanube-mcp tools-doc`.\n\n");
    let mut group = "";
    for endpoint in catalog::endpoints() {
        if endpoint.group != group {
            group = &endpoint.group;
            text.push_str(&format!("\n## {group}\n\n| Tool | Method and path | Scope | Purpose |\n| --- | --- | --- | --- |\n"));
        }
        text.push_str(&format!(
            "| `{}` | `{} {}` | {} | {} |\n",
            endpoint.name,
            endpoint.method,
            endpoint.path,
            endpoint.scope.replace('|', "\\|"),
            endpoint.description.replace('|', "\\|")
        ));
    }
    text.push_str("\n## Workflows and guidance\n\n");
    for tool in &DATA.custom {
        text.push_str(&format!("- `{}` — {}\n", tool.name, tool.description));
    }
    text
}
