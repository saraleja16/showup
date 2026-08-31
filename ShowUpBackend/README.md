# ShowUp Backend

## Database setup

Connection string key: `ConnectionStrings:DefaultConnection`

**Supabase details (non-secret):**
- Host: `aws-1-us-west-2.pooler.supabase.com`
- Port: `5432`
- Database: `postgres`
- Username: `postgres.yvspirjyltjfzgjuotib`

**Password:** get privately from team lead. Do not commit it.

### Option A — User Secrets (recommended for local dev)

```bash
dotnet user-secrets set "ConnectionStrings:DefaultConnection" "Host=aws-1-us-west-2.pooler.supabase.com;Port=5432;Database=postgres;Username=postgres.yvspirjyltjfzgjuotib;Password=YOUR_PASSWORD;SSL Mode=Require;Trust Server Certificate=true;Pooling=true;Minimum Pool Size=1;Maximum Pool Size=20;Connection Idle Lifetime=300"
```

### Option B — Environment variable

```bash
export ConnectionStrings__DefaultConnection="Host=...;Password=YOUR_PASSWORD;..."
```

See `.env.example` for the variable name.

## Run

```bash
dotnet restore
dotnet ef database update
dotnet run --launch-profile http
```

API: `http://localhost:5033` · Swagger: `http://localhost:5033/swagger`
