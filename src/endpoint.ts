import { introspectSchema, WrapType } from "@graphql-tools/wrap";
import { fetch } from "cross-fetch";
import { print } from "graphql";
import { AsyncExecutor } from "@graphql-tools/utils";
import { stitchSchemas } from "@graphql-tools/stitch";
import { graphqlHTTP } from "express-graphql";
import express from "express";
import { Server } from "http";
import fs from "fs";
import { SubschemaConfig } from "./model";
import path from "path"
import {setupGraphiqlConsole} from '@subsquid/openreader/dist/server'



export class Endpoint {
  run(): void {
    const port = Number(process.env.GRAPHQL_PORT) || 4000;
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
    const subschemasCfg = this.readSubschemas();
    const gatewaySchema = await this.getStitchedSchema(subschemasCfg);
    const app = express();
    app.use("/graphql", graphqlHTTP({ schema: gatewaySchema, graphiql: false  }));
    app.get('/console', (req, res) => {
      const fullUrl = req.protocol + '://' + req.get('host') + req.originalUrl;
      res.redirect("https://graphql-console.subsquid.io/?graphql_api="+fullUrl)
    })
    //setupGraphiqlConsole(app)
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

  private readSubschemas(
    localpath: string = "subschemas.json"
  ): Array<SubschemaConfig> {
    try {
      const jsonString = fs.readFileSync(path.resolve(localpath)).toString();
      const subschemas = JSON.parse(jsonString);
      if (
        !subschemas.every((schema: SubschemaConfig) => 
          schema.url && schema.name
        )
      ) {
        console.error("Wrong subschemas config");
        process.exit(1);
      }
      return subschemas as Array<SubschemaConfig>;
    } catch (err) {
      console.error(err);
      process.exit(1);
    }
  }

  private async createAndTransformSubschema({ url, name }: SubschemaConfig) {
    const rmtExecutor = this.makeRmtExecutor(url);
    const subschema = await introspectSchema(rmtExecutor)
    const queryType = subschema.getQueryType()?.name || 'Query'
    const schemaConfig = {
      schema: subschema,
      executor: rmtExecutor,
      transforms: [new WrapType(queryType, `${name}Query`, name)],
    };
    return schemaConfig;
  }

  private async getStitchedSchema(subschemasCfg: Array<SubschemaConfig>) {
    const gatewaySchema = stitchSchemas({
      subschemas: await Promise.all(
        subschemasCfg.map(async (subschema) => {
          return this.createAndTransformSubschema(subschema);
        })
      ),
      mergeTypes: true,
      typeMergingOptions: {
        typeCandidateMerger: (candidates) => candidates[0],
        typeDescriptionsMerger: (candidates) => candidates[0].type.description,
        fieldConfigMerger: (candidates) => candidates[0].fieldConfig,
        inputFieldConfigMerger: (candidates) => candidates[0].inputFieldConfig,
        enumValueConfigMerger: (candidates) => candidates[0].enumValueConfig,
      },
    });
    return gatewaySchema;
  }
}
