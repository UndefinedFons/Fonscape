export const CANONICAL_REPOSITORY = "https://github.com/UndefinedFons/Fonscape.git";
export const VERSION_FILE = ".fonscape-version";
export const UPDATE_DIRECTORY = ".fonscape-update";
export const SEMVER = /^(?:v)?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;
export const CONFLICT_MARKER = /^(?:<{7}|={7}|>{7})/mu;
export const MANDATORY_USER_PATTERNS = [
  ".env",
  ".env.*",
  ".dev.vars",
  ".dev.vars.*",
  "fonscape.config.js",
  "src/content/friends.json",
  "src/content/posts/**",
  "src/content/poems/**",
  "src/content/music/**",
  "public/assets/**",
  "public/audio/**",
];
export const ALLOWED_SEED_PATHS = new Set(["fonscape.config.js", "src/content/friends.json"]);
export const PUBLIC_ENV_TEMPLATE_PATH = ".env.example";
