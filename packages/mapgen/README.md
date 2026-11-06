# @blkc-code/mapgen

Grow a unique map from a project, and keep it in step as the project changes. Rooms that exist stay where they are, and new folders add new ones. The output is plain JSON, so any renderer can draw it.

```ts
import { evolveMap, scanProject } from "@blkc-code/mapgen";

const { map, changes } = evolveMap(previous, scanProject("."), "my-project");
```

Part of [BLKC](https://blkc.blackcode.space). Apache-2.0.
