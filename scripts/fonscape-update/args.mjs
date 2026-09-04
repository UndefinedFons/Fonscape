import { VERSION_FILE } from "./constants.mjs";
import { safeRelativePath } from "./paths.mjs";

export function usage() {
  return `Fonscape 安全升级器

用法：
  pnpm fonscape update [--from X.Y.Z] [--to X.Y.Z] [--apply]
  pnpm fonscape update --keep <站点文件> [--keep <另一个文件>]
  pnpm fonscape update --take-incoming <冲突文件> [--take-incoming <另一个冲突文件>]
  pnpm fonscape update --reconcile-theme [--apply]
  pnpm fonscape update --apply --resolutions <已解决冲突目录>
  pnpm fonscape update --rollback <备份目录>

默认仅预演，不会修改文件。站点必须已有 ${VERSION_FILE}；缺少 marker 时，
即使提供 --from 也会停止，升级器不会猜测或初始化来源版本。
--reconcile-theme 会让目标发布版重新接管全部 theme 文件，但仍保护 user 文件，
并继续三方合并 merge 文件；应用前请先检查预演清单。`;
}

export function parseArgs(argv) {
  const args = argv[0] === "update" ? argv.slice(1) : argv;
  const parsed = { apply: false, project: process.cwd() };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--apply") parsed.apply = true;
    else if (arg === "--reconcile-theme") parsed.reconcile_theme = true;
    else if (arg === "--help" || arg === "-h") parsed.help = true;
    else if (["--from", "--to", "--project", "--repository", "--source-dir", "--target-dir", "--resolutions", "--rollback", "--keep", "--take-incoming"].includes(arg)) {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${arg} 缺少参数。`);
      if (arg === "--keep") (parsed.keep ||= []).push(safeRelativePath(value));
      else if (arg === "--take-incoming") (parsed.take_incoming ||= []).push(safeRelativePath(value));
      else parsed[arg.slice(2).replaceAll("-", "_")] = value;
      index += 1;
    } else {
      throw new Error(`无法识别的参数：${arg}`);
    }
  }
  return parsed;
}
