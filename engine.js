/***********************
 * 1) COMMAND PARSER
 ***********************/
const DICTIONARY = {
  app: ["app", "اپ"],
  note: ["note", "یادداشت"],
  list: ["list", "لیست"],
  login: ["login", "ورود", "لاگین"],
  save: ["save", "ذخیره"],
  page: ["page", "صفحه"],
  button: ["button", "دکمه"],
  settings: ["settings", "تنظیمات"],
  heavy: ["heavy", "سنگین", "حرفه‌ای"],
  if: ["if", "اگر"]
};

function parseCommand(text) {
  const found = [];
  const t = text.toLowerCase();

  for (let key in DICTIONARY) {
    DICTIONARY[key].forEach(word => {
      if (t.includes(word) && !found.includes(key)) {
        found.push(key);
      }
    });
  }

  return found;
}

/***********************
 * 2) INTENT ENGINE
 ***********************/
function detectIntent(blocks) {
  return {
    level: blocks.includes("heavy") ? "advanced" : "normal",
    needsLogin: blocks.includes("login"),
    needsStorage: blocks.includes("save"),
    multiPage: blocks.includes("page") || blocks.includes("settings")
  };
}

/***********************
 * 3) APP BLUEPRINT
 ***********************/
function buildBlueprint(blocks, intent) {
  return {
    pages: intent.multiPage ? ["home", "settings"] : ["home"],
    components: blocks.filter(b =>
      ["note", "list", "button", "login"].includes(b)
    ),
    storage: intent.needsStorage ? "local" : "none",
    level: intent.level
  };
}

/***********************
 * 4) CODE GENERATOR
 ***********************/
function generateAppCode(blueprint) {
  let code = "📦 APP STRUCTURE\n\n";

  code += "Pages:\n";
  blueprint.pages.forEach(p => code += "- " + p + "\n");

  code += "\nComponents:\n";
  blueprint.components.forEach(c => code += "- " + c + "\n");

  code += "\nStorage: " + blueprint.storage + "\n";
  code += "Mode: " + blueprint.level + "\n";

  code += "\n✅ App ready for Android WebView";

  return code;
}

/***********************
 * 5) OPTIMIZER
 ***********************/
function optimize(code, level) {
  if (level === "advanced") {
    return code + "\n\n⚙ Optimized for heavy apps (modular & scalable)";
  }
  return code;
}

/***********************
 * MAIN ENTRY
 ***********************/
function buildApp() {
  const input = document.getElementById("command").value;
  const output = document.getElementById("output");

  const blocks = parseCommand(input);
  const intent = detectIntent(blocks);
  const blueprint = buildBlueprint(blocks, intent);
  let code = generateAppCode(blueprint);
  code = optimize(code, intent.level);

  output.innerText =
    "Detected Blocks:\n" +
    JSON.stringify(blocks, null, 2) +
    "\n\nBlueprint:\n" +
    JSON.stringify(blueprint, null, 2) +
    "\n\nGenerated Output:\n" +
    code;
}
