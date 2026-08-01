import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile } from "fs/promises";
import AdmZip from "adm-zip";

// server deps to bundle to reduce openat(2) syscalls
// which helps cold start times
const allowlist = [
  "@google/generative-ai",
  "axios",
  "connect-pg-simple",
  "cookie-parser",
  "cors",
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-rate-limit",
  "express-session",
  "helmet",
  "jsonwebtoken",
  "memorystore",
  "multer",
  "nanoid",
  "nodemailer",
  "openai",
  "passport",
  "passport-local",
  "pg",
  "stripe",
  "uuid",
  "web-push",
  "ws",
  "xlsx",
  "zod",
  "zod-validation-error",
];

async function buildAll() {
  await rm("dist", { recursive: true, force: true });

  console.log("building client...");
  await viteBuild();

  console.log("building server...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter((dep) => !allowlist.includes(dep));

  await esbuild({
    entryPoints: ["server/index.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "dist/index.cjs",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    external: externals,
    logLevel: "info",
  });

  console.log("building lambda bundle...");

  const lambdaExternals = externals.filter(
  (dep) => dep !== "@vendia/serverless-express"
  );
  
  // AWS SDK já vem pré-instalado no ambiente Lambda — não precisa no ZIP
  const lambdaExternal = [
    "@aws-sdk/client-dynamodb",
    "@aws-sdk/lib-dynamodb",
    ...lambdaExternals,
  ];

  await esbuild({
    entryPoints: ["server/lambda.ts"],
    platform: "node",
    target: "node20",
    bundle: true,
    format: "cjs",
    outfile: "dist/lambda.js",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    external: lambdaExternal,
    logLevel: "info",
  });

  console.log("building reminders bundle...");

  // Bundle separado, e não um segundo export do lambda.ts: assim o job de
  // lembretes não carrega Express nem tokens.ts — que exige JWT_SECRET já na
  // importação. Ver ADR-0008.
  await esbuild({
    entryPoints: ["server/lembretes-handler.ts"],
    platform: "node",
    target: "node20",
    bundle: true,
    format: "cjs",
    outfile: "dist/lembretes.js",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    external: lambdaExternal,
    logLevel: "info",
  });

  console.log("packaging lambda zip...");

  // Os handlers são "dist/lambda.handler" e "dist/lembretes.handler"
  // (infra/lambda.tf), então os arquivos precisam ficar sob dist/ dentro do
  // ZIP — não na raiz. As duas funções compartilham este mesmo pacote, o que
  // impede que uma fique numa versão do código e a outra noutra.
  const zip = new AdmZip();
  zip.addLocalFile("dist/lambda.js", "dist");
  zip.addLocalFile("dist/lembretes.js", "dist");

  // Timestamp fixo: sem isso o mtime entra no ZIP e o source_code_hash muda a
  // cada build, redeployando a Lambda mesmo com o bundle byte-a-byte idêntico.
  for (const entry of zip.getEntries()) {
    entry.header.time = new Date(Date.UTC(1980, 0, 1));
  }

  zip.writeZip("dist/lambda.zip");
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
