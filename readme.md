## Schema and pattern selection:

### Proxy pattern (now)

All instances of the same type just has prefixes or namespaces

__Pro__: The easiest way

__Con__: All union logic should be implemented by partners (now)

### Join pattern:

We have a instance from _canonical_ source and this instances from other source with additional fields (id should be the same)

__Possible schemas__:
```
account {
    substateId
    kusamaTransfers {...}
    polkadotTransfer {...}
    kusamaStaking {...}
    polkadotStaking {...}
}

```
```
account {
    substrateId
    transfers {
        kusamaTransfers {...}
        polkadotTransfer {...}
        ...
    }
    staking {
        ...
    }

}
```
Pro: the supposed way to join by all tools (can be implemented in semi-auto way)

Con: we should have a _canonical_ source type, in order parachain data can merge into it (should contain all the substrate ids of all the chains)


### Union pattern:

We unite all arrays of entities of the same type
```
account {
    substateId
    transfers [
        {
            chain
            data
        }
    ]
}

```
Con: Almost manual implementation 


## Service selection:
### Hasura:
__Pros:__
- Very easy to implement
- Hot adding and removing new schemas

__Cons:__

- Only _Join_ and _Proxy_ patterns
- Not very customizable

### Graphql-tools:
__Pros:__
- All patterns
- Pretty customizable

__Cons:__
- Need more time to implement
- No hot reload (?)

## Deploy selection:

Should we unite all services under one _compose_ file or not