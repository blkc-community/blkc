# @blkc-code/connect

Connect the AI agents on a machine to a local MCP server by writing each agent's own settings: Claude Code, Cursor, VS Code and Gemini CLI. It merges with what is there, removes only what it added, and refuses to overwrite settings it can't read.

```ts
import { connectClient } from "@blkc-code/connect";

await connectClient("cursor", { root: process.cwd(), kit: "kits/office" });
```

Part of [BLKC](https://blkc.blackcode.space). Apache-2.0.
