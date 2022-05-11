import { introspectSchema, RenameTypes, RenameRootFields, WrapType } from '@graphql-tools/wrap'
import { fetch } from 'cross-fetch'
import { print } from 'graphql'
import { AsyncExecutor } from '@graphql-tools/utils'
import { stitchSchemas } from '@graphql-tools/stitch'
import { graphqlHTTP } from 'express-graphql'

const express = require('express')

const app = express()

function makeRmtExecutor(url : string) : AsyncExecutor {
    return async ({ document  , variables}) => {
        const query = print(document)
        const fetchResult = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, variables })
        })
        return fetchResult.json()
    }
}

async function createAndTransformSubschema(url :string,prefix: string) {
    const rmtExecutor = makeRmtExecutor(url)
    const schema = await introspectSchema(rmtExecutor)
    const fileds = schema
    const schemaConfig = {
        schema: await introspectSchema(rmtExecutor),
        executor: rmtExecutor,
        transforms: [
            //new RenameRootFields((op, name) => `${prefix}_${name}`),
            new WrapType('Query', `${prefix}Query`, prefix)
        ]
    }
    return schemaConfig
}

async function getStitchedSchema() {
    

    const gatewaySchema = stitchSchemas({
        subschemas: [
            await createAndTransformSubschema('http://localhost:4350/graphql','statemine'),
            await createAndTransformSubschema('http://localhost:4351/graphql', 'calamari')
        ],
        mergeTypes: true,
        typeMergingOptions: {
            typeCandidateMerger: (candidates) => candidates[0],
            typeDescriptionsMerger: (candidates) => candidates[0].type.description,
            fieldConfigMerger: (candidates) => candidates[0].fieldConfig,
            inputFieldConfigMerger: (candidates) => candidates[0].inputFieldConfig,
            enumValueConfigMerger: (candidates) => candidates[0].enumValueConfig,
          },
    });
    return gatewaySchema
}

getStitchedSchema().then((gatewaySchema) => {
    app.use('/graphql', graphqlHTTP({ schema: gatewaySchema, graphiql: true }))
    app.listen(4000, () => console.log('gateway running at http://localhost:4000/graphql'))
})
