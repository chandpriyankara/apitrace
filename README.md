# @tix.lk/apitrace

NestJS library that discovers API endpoints at runtime and generates [Mermaid](https://mermaid.js.org/) sequence diagrams for documentation and debugging.

Repository: [github.com/chandpriyankara/apitrace](https://github.com/chandpriyankara/apitrace)

## Install

```bash
pnpm add @tix.lk/apitrace
```

## Usage

```typescript
import { Module } from '@nestjs/common';
import { join } from 'path';
import { ApiTraceModule } from '@tix.lk/apitrace';

@Module({
  imports: [
    ApiTraceModule.forRoot({
      apiName: 'My API',
      sourceRoot: join(process.cwd(), 'src'),
    }),
  ],
})
export class AppModule {}
```

When enabled, the module exposes endpoints that return discovered controllers, services, and Mermaid diagrams.

## Development

```bash
pnpm install
pnpm test
pnpm build
```

## Publish

```bash
pnpm publish --access public
```

## License

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE).
