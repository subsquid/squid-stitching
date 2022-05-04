import { introspectSchema } from '@graphql-tools/wrap'
import { fetch } from 'cross-undici-fetch'
import { print } from 'graphql'
import { AsyncExecutor } from '@graphql-tools/utils'
import { stitchSchemas } from '@graphql-tools/stitch'
import { graphqlHTTP } from 'express-graphql'

const express = require('express')

const app = express()

const remoteExecutorStm : AsyncExecutor = async ({ document  , variables}) => {
  const query = print(document)
  const fetchResult = await fetch('http://localhost/4350/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables })
  })
  return fetchResult.json()
}

const remoteExecutorClm : AsyncExecutor = async ({ document  , variables}) => {
    const query = print(document)
    const fetchResult = await fetch('http://localhost/4351/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables })
    })
    return fetchResult.json()
  }

async function getStitchedSchema() {
    const stmSubschema = {
        schema: await introspectSchema(remoteExecutorStm),
        executor: remoteExecutorStm
    }
    
    const clmSubschema = {
        schema: await introspectSchema(remoteExecutorClm),
        executor: remoteExecutorClm
    }

    const gatewaySchema = stitchSchemas({
        subschemas: [stmSubschema,clmSubschema],
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
