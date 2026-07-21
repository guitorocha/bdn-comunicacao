import serverlessExpress from "@vendia/serverless-express";
import express, { type Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { registerRoutes } from "./routes";
import { createServer } from "http";

let appHandler: ReturnType<typeof serverlessExpress>;

export const handler = async (event: any, context: any) => {
  if (!appHandler) {
    const app = express();
    const httpServer = createServer(app);

    // API Gateway/CloudFront são proxies: sem isso req.ip é o proxy e o rate
    // limit do login trataria todos os usuários como um só cliente.
    app.set("trust proxy", 1);
    app.use(helmet({ contentSecurityPolicy: false }));

    const stage = process.env.STAGE;

    // Remove prefixo do stage, ex: "/production"
    app.use((req, _res, next) => {
      if (stage && req.url.startsWith(`/${stage}`)) {
        req.url = req.url.slice(stage.length + 1);
      }
      next();
    });

    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));
    // Lambda monta o próprio app: o cookie-parser precisa ser registrado aqui
    // também, senão a sessão via cookie só funcionaria no servidor de dev.
    app.use(cookieParser());

    await registerRoutes(httpServer, app);

    app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";
      if (res.headersSent) return next(err);
      return res.status(status).json({ message });
    });

    appHandler = serverlessExpress({ app });
  }

  return appHandler(event, context);
};