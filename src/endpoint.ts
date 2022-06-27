import {
  introspectSchema,
  WrapType,
  RenameTypes,
  WrapQuery,
  WrapFields,
  RemoveObjectFieldDeprecations,
} from "@graphql-tools/wrap";
import { fetch } from "cross-fetch";
import { print } from "graphql";
import cors from "cors";
import { AsyncExecutor } from "@graphql-tools/utils";
import { stitchSchemas, ValidationLevel } from "@graphql-tools/stitch";
import { graphqlHTTP } from "express-graphql";
import express from "express";
import { Server } from "http";
import fs from "fs";
import { Config, NamespaceConfig } from "./model";

export class Endpoint {
  private config: Config;

  constructor(path: string) {
    const jsonString = fs.readFileSync(path).toString();
    const config = JSON.parse(jsonString);
    if (!this.isConfigValid(config)) throw new Error("Invalid config");

    this.config = config;
  }

  private isConfigValid(config: Config) {
    return config.every(
      (schema: NamespaceConfig) => schema.urls && schema.name
    );
  }

  run(): void {
    const port = Number(process.env.GRAPHQL_SERVER_PORT) || 4000;
    this.start(port).then(
      (s) => {
        console.log(`Squid graphql is running on port ${port}`);
      },
      (err) => {
        console.error(err);
        process.exit(1);
      }
    );
  }

  async start(port: Number): Promise<Server> {
    const gatewaySchema = await this.getStitchedSchema(this.config);
    const app = express();
    app.use(
      cors({
        origin: "*",
      })
    );
    app.use("/graphql", graphqlHTTP({ schema: gatewaySchema, graphiql: true }));
    return app.listen(port);
  }

  private makeRmtExecutor(url: string): AsyncExecutor {
    return async ({ document, variables }) => {
      const query = print(document);
      const fetchResult = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables }),
      });
      return fetchResult.json();
    };
  }

  private async createAndTransformSubschema({ urls, name }: NamespaceConfig) {
    const subschemas = await Promise.all(
      urls.map(async (url) => {
        const rmtExecutor = this.makeRmtExecutor(url);
        const subschema = await introspectSchema(rmtExecutor);
        return {
          schema: subschema,
          executor: rmtExecutor,
        };
      })
    );

    const queryType = "Query";
    const newQueryName = `${name}Query`;

    return {
      schema: stitchSchemas({
        subschemas,
      }),
      transforms: [
        new WrapType(queryType, newQueryName, name),
        new RenameTypes((type_) =>
          type_ === newQueryName ? newQueryName : `${name}_${type_}`
        ),
        new RemoveObjectFieldDeprecations("Depracated"),
      ],
    };
  }

  private async getStitchedSchema(subschemasCfg: Config) {
    const gatewaySchema = stitchSchemas({
      subschemas: (
        await Promise.all(
          subschemasCfg.map(async (subschema) => {
            return this.createAndTransformSubschema(subschema);
          })
        )
      ).flat(),
      mergeTypes: false,
    });
    return gatewaySchema;
  }
}
