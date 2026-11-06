# @blkc-code/agents

Track what agents are doing and hand them work, over MCP or from code. It works with any agent, and the state goes wherever you put it: a JSON file by default, or your own `AgentStore`.

```ts
import { createFileStore, serveOverStdio } from "@blkc-code/agents";

const store = createFileStore("state.json");
await serveOverStdio(store, { version: "1.0.0" });
```

Part of [BLKC](https://blkc.blackcode.space). Apache-2.0.
