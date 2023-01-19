import {Config, NamespaceConfig} from './model'
import {RemoveObjectFieldDeprecations, WrapType, introspectSchema} from '@graphql-tools/wrap'
import {AsyncExecutor} from '@graphql-tools/utils'
import {stitchSchemas} from '@graphql-tools/stitch'
import {print} from 'graphql'
import {Server} from 'http'
import cors from 'cors'
import express from 'express'
import {fetch} from 'cross-fetch'
import fs from 'fs'
import {graphqlHTTP} from 'express-graphql'

export class Endpoint {
    private config: Config

    constructor(path: string) {
        const jsonString = fs.readFileSync(path).toString()
        const config = JSON.parse(jsonString)
        if (!this.isConfigValid(config)) throw new Error('Invalid config')

        this.config = config
    }

    private isConfigValid(config: Config) {
        return config.every((schema: NamespaceConfig) => schema.urls && schema.name)
    }

    run(): void {
        const port = Number(process.env.GRAPHQL_SERVER_PORT) || 4000
        this.start(port).then(
            (s) => {
                console.log(`Squid graphql is running on port ${port}`)
            },
            (err) => {
                console.error(err)
                process.exit(1)
            }
        )
    }

    async start(port: Number): Promise<Server> {
        const gatewaySchema = await this.getStitchedSchema(this.config)
        const app = express()
        app.use(
            cors({
                origin: '*',
            })
        )
        app.use('/graphql', graphqlHTTP({schema: gatewaySchema, graphiql: true}))
        return app.listen(port)
    }

    private makeRmtExecutor(url: string): AsyncExecutor {
        return async ({document, variables}) => {
            const query = print(document)
            const fetchResult = await fetch(url, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({query, variables}),
            })
            return fetchResult.json()
        }
    }

    private async createAndTransformSubschema({urls, name}: NamespaceConfig) {
        const subschemas = await Promise.all(
            urls.map(async (url) => {
                const rmtExecutor = this.makeRmtExecutor(url)
                const subschema = await introspectSchema(rmtExecutor)
                return {
                    schema: subschema,
                    executor: rmtExecutor,
                }
            })
        )

        const queryType = 'Query'
        const newQueryName = `${name}Query`

        return {
            schema: stitchSchemas({subschemas}),
            transforms: [
                new WrapType(queryType, newQueryName, name),
                // new RenameTypes((type_) =>
                //   type_ === newQueryName ? newQueryName : `${name}_${type_}`
                // ),
                new RemoveObjectFieldDeprecations('Depracated'),
            ],
        }
    }

    private async getStitchedSchema(subschemasCfg: Config) {
        const gatewaySchema = stitchSchemas({
            subschemas: await Promise.all(
                subschemasCfg.map(async (subschema) => {
                    try {
                        return await this.createAndTransformSubschema(subschema)
                    } catch (e) {
                        console.log(e)
                        return null
                    }
                })
            ).then((subschemas) => subschemas.flat().filter((s): s is any => s != null)) as any,
            mergeTypes: false,
        })
        return gatewaySchema
    }
}
