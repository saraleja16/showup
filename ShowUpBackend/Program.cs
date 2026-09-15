using System.Text;
using System.Threading.RateLimiting;
using DotNetEnv;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using ShowUpBackend.Configuration;
using ShowUpBackend.Data;
using ShowUpBackend.Filters;
using ShowUpBackend.Middleware;
using ShowUpBackend.Repositories;
using ShowUpBackend.Repositories.Interfaces;
using ShowUpBackend.Services;
using ShowUpBackend.Services.Interfaces;

Env.Load();

var builder = WebApplication.CreateBuilder(args);

builder.Services.Configure<JwtOptions>(builder.Configuration.GetSection(JwtOptions.SectionName));
builder.Services.PostConfigure<JwtOptions>(opts =>
{
    if (string.IsNullOrWhiteSpace(opts.Key))
        opts.Key = Environment.GetEnvironmentVariable("Jwt__Key") ?? string.Empty;
});
builder.Services.Configure<MatchmakingOptions>(builder.Configuration.GetSection(MatchmakingOptions.SectionName));
builder.Services.Configure<RateLimitingOptions>(builder.Configuration.GetSection(RateLimitingOptions.SectionName));
builder.Services.Configure<CursorAiOptions>(builder.Configuration.GetSection(CursorAiOptions.SectionName));
builder.Services.PostConfigure<CursorAiOptions>(opts =>
{
    if (string.IsNullOrWhiteSpace(opts.ApiKey))
        opts.ApiKey = Environment.GetEnvironmentVariable("CURSOR_API_KEY") ?? string.Empty;
});
builder.Services.Configure<GoogleMapsOptions>(builder.Configuration.GetSection(GoogleMapsOptions.SectionName));
builder.Services.PostConfigure<GoogleMapsOptions>(opts =>
{
    if (string.IsNullOrWhiteSpace(opts.ApiKey))
        opts.ApiKey = Environment.GetEnvironmentVariable("GOOGLE_MAPS_API_KEY") ?? string.Empty;
});
builder.Services.Configure<EmailOptions>(builder.Configuration.GetSection(EmailOptions.SectionName));
builder.Services.Configure<GoogleAuthOptions>(builder.Configuration.GetSection(GoogleAuthOptions.SectionName));
builder.Services.Configure<EventLifecycleOptions>(builder.Configuration.GetSection(EventLifecycleOptions.SectionName));
builder.Services.Configure<AttendanceOptions>(builder.Configuration.GetSection(AttendanceOptions.SectionName));
builder.Services.PostConfigure<AttendanceOptions>(opts =>
{
    // Legacy CheckIn keys only fill values not explicitly set under Attendance.
    var attendance = builder.Configuration.GetSection(AttendanceOptions.SectionName);
    var checkIn = builder.Configuration.GetSection("CheckIn");
    if (!attendance.GetSection(nameof(AttendanceOptions.MinutesBeforeStart)).Exists() &&
        int.TryParse(checkIn["WindowOpenMinutes"], out var open) && open > 0)
        opts.MinutesBeforeStart = open;
    if (!attendance.GetSection(nameof(AttendanceOptions.MinutesAfterStart)).Exists() &&
        int.TryParse(checkIn["WindowCloseMinutes"], out var close) && close > 0)
        opts.MinutesAfterStart = close;
    if (!attendance.GetSection(nameof(AttendanceOptions.CheckInRadiusMeters)).Exists() &&
        double.TryParse(checkIn["RadiusMeters"], out var radius) && radius > 0)
        opts.CheckInRadiusMeters = radius;
});
builder.Services.PostConfigure<GoogleAuthOptions>(opts =>
{
    if (string.IsNullOrWhiteSpace(opts.WebClientId))
        opts.WebClientId = Environment.GetEnvironmentVariable("GoogleAuth__WebClientId") ?? string.Empty;
});

builder.Services.AddHttpClient("CursorAi");
builder.Services.AddHttpClient("GoogleGeocoding", client =>
{
    client.Timeout = TimeSpan.FromSeconds(10);
});
builder.Services.AddScoped<IGeocodingService, GoogleGeocodingService>();

var jwtOptions = builder.Configuration.GetSection(JwtOptions.SectionName).Get<JwtOptions>() ?? new JwtOptions();
if (string.IsNullOrWhiteSpace(jwtOptions.Key))
{
    jwtOptions.Key = Environment.GetEnvironmentVariable("Jwt__Key")
        ?? "DEVELOPMENT_ONLY_REPLACE_WITH_Jwt__Key_ENV_32CHARS_MIN";
}

var rateLimitingOptions = builder.Configuration.GetSection(RateLimitingOptions.SectionName).Get<RateLimitingOptions>()
    ?? new RateLimitingOptions();

if (rateLimitingOptions.TrustForwardedHeaders)
{
    builder.Services.Configure<ForwardedHeadersOptions>(options =>
    {
        options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
        options.KnownNetworks.Clear();
        options.KnownProxies.Clear();
        foreach (var proxy in rateLimitingOptions.KnownProxies)
        {
            if (System.Net.IPAddress.TryParse(proxy, out var address))
                options.KnownProxies.Add(address);
        }
    });
}

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(
        builder.Configuration.GetConnectionString("DefaultConnection"),
        npgsql => npgsql.EnableRetryOnFailure(
            maxRetryCount: 3,
            maxRetryDelay: TimeSpan.FromSeconds(5),
            errorCodesToAdd: null
        )
    ));

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = jwtOptions.Issuer,
            ValidAudience = jwtOptions.Audience,
            IssuerSigningKey = new SymmetricSecurityKey(
                Encoding.UTF8.GetBytes(
                    string.IsNullOrWhiteSpace(jwtOptions.Key)
                        ? "DEVELOPMENT_ONLY_REPLACE_WITH_Jwt__Key_ENV_32CHARS_MIN"
                        : jwtOptions.Key))
        };
    });

builder.Services.AddAuthorization();

builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.OnRejected = async (context, cancellationToken) =>
    {
        context.HttpContext.Response.StatusCode = StatusCodes.Status429TooManyRequests;

        if (context.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retryAfter))
        {
            var seconds = Math.Max(1, (int)Math.Ceiling(retryAfter.TotalSeconds));
            context.HttpContext.Response.Headers.RetryAfter = seconds.ToString();
        }

        await context.HttpContext.Response.WriteAsJsonAsync(
            new { message = "Too many attempts. Please try again shortly." },
            cancellationToken);
    };

    options.AddPolicy(RateLimitPolicies.AuthLogin, httpContext =>
    {
        var opts = httpContext.RequestServices.GetRequiredService<IOptions<RateLimitingOptions>>().Value;
        return RateLimitPartition.GetFixedWindowLimiter(
            GetClientIpPartition(httpContext),
            _ => new FixedWindowRateLimiterOptions
            {
                AutoReplenishment = true,
                PermitLimit = Math.Max(1, opts.LoginPermitLimit),
                Window = TimeSpan.FromSeconds(Math.Max(1, opts.LoginWindowSeconds)),
                QueueLimit = 0
            });
    });

    options.AddPolicy(RateLimitPolicies.AuthRegister, httpContext =>
    {
        var opts = httpContext.RequestServices.GetRequiredService<IOptions<RateLimitingOptions>>().Value;
        return RateLimitPartition.GetFixedWindowLimiter(
            GetClientIpPartition(httpContext),
            _ => new FixedWindowRateLimiterOptions
            {
                AutoReplenishment = true,
                PermitLimit = Math.Max(1, opts.RegisterPermitLimit),
                Window = TimeSpan.FromSeconds(Math.Max(1, opts.RegisterWindowSeconds)),
                QueueLimit = 0
            });
    });

    options.AddPolicy(RateLimitPolicies.AuthAvailability, httpContext =>
    {
        var opts = httpContext.RequestServices.GetRequiredService<IOptions<RateLimitingOptions>>().Value;
        return RateLimitPartition.GetFixedWindowLimiter(
            GetClientIpPartition(httpContext),
            _ => new FixedWindowRateLimiterOptions
            {
                AutoReplenishment = true,
                PermitLimit = Math.Max(1, opts.AvailabilityPermitLimit),
                Window = TimeSpan.FromSeconds(Math.Max(1, opts.AvailabilityWindowSeconds)),
                QueueLimit = 0
            });
    });
});

static string GetClientIpPartition(HttpContext httpContext)
{
    // Prefer Connection.RemoteIpAddress. Only reflects X-Forwarded-For when
    // TrustForwardedHeaders + KnownProxies are configured (see RateLimitingOptions).
    var ip = httpContext.Connection.RemoteIpAddress;
    if (ip is null)
        return "unknown";

    // Normalize IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1 -> 127.0.0.1).
    if (ip.IsIPv4MappedToIPv6)
        ip = ip.MapToIPv4();

    // Keep localhost IPv4/IPv6 in one bucket so ::1 and 127.0.0.1 share limits.
    if (System.Net.IPAddress.IsLoopback(ip))
        return "loopback";

    return ip.ToString();
}

// Public services
builder.Services.AddScoped<IUserService, UserService>();
builder.Services.AddScoped<IAuthService, AuthService>();
builder.Services.AddScoped<ITokenService, TokenService>();
builder.Services.AddScoped<IEventService, EventService>();
builder.Services.AddScoped<IEventLiveService, EventLiveService>();
builder.Services.AddScoped<IEventResultService, EventResultService>();
builder.Services.AddScoped<IVenueService, VenueService>();
builder.Services.AddScoped<IProfilePortfolioService, ProfilePortfolioService>();
builder.Services.AddScoped<IProfileService, ProfileService>();
builder.Services.AddScoped<IPositionService, PositionService>();
builder.Services.AddScoped<IReliabilityService, ReliabilityService>();
builder.Services.AddScoped<IMatchmakingService, MatchmakingService>();
builder.Services.AddScoped<IJoinRequestService, JoinRequestService>();
builder.Services.AddScoped<IChatService, ChatService>();
builder.Services.AddScoped<IEventInvitationService, EventInvitationService>();
builder.Services.AddScoped<IAiSearchService, AiSearchService>();
builder.Services.AddScoped<IOtpService, OtpService>();

// Pick the email transport at startup: real SMTP when credentials exist. Local
// development may log the OTP, but production must fail loudly instead of
// pretending an email was sent.
var emailOptions = builder.Configuration.GetSection(EmailOptions.SectionName).Get<EmailOptions>() ?? new EmailOptions();
if (emailOptions.IsConfigured)
{
builder.Services.AddHttpClient<IEmailSender, BrevoApiEmailSender>();}
else if (builder.Environment.IsDevelopment())
{
    builder.Services.AddScoped<IEmailSender, LoggingEmailSender>();
}
else
{
    builder.Services.AddScoped<IEmailSender, MisconfiguredEmailSender>();
}
builder.Services.AddHttpClient<INotificationService, NotificationService>();

// Admin services
builder.Services.AddScoped<IAdminEventService, AdminEventService>();
builder.Services.AddScoped<IAdminUserService, AdminUserService>();

// Background services
builder.Services.AddHostedService<CheckInLifecycleService>();

// Repositories
builder.Services.AddScoped<IUserRepository, UserRepository>();
builder.Services.AddScoped<IEventRepository, EventRepository>();
builder.Services.AddScoped<INotificationRepository, NotificationRepository>();
builder.Services.AddScoped<IVenueRepository, VenueRepository>();
builder.Services.AddScoped<IPositionRepository, PositionRepository>();
builder.Services.AddScoped<IJoinRequestRepository, JoinRequestRepository>();
builder.Services.AddScoped<IEmailOtpRepository, EmailOtpRepository>();

builder.Services.AddScoped<AdminKeyFilter>();

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new OpenApiInfo { Title = "ShowUp API", Version = "v1" });
    c.MapType<IFormFile>(() => new OpenApiSchema { Type = "string", Format = "binary" });
    c.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Description = "JWT Authorization header using the Bearer scheme.",
        Name = "Authorization",
        In = ParameterLocation.Header,
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT"
    });
    c.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecurityScheme
            {
                Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = "Bearer" }
            },
            Array.Empty<string>()
        }
    });
});

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        if (builder.Environment.IsDevelopment())
        {
            // Development: allow any origin so Expo web / localhost works without configuration.
            policy.AllowAnyOrigin()
                  .AllowAnyMethod()
                  .AllowAnyHeader();
        }
        else
        {
            // Production: restrict to configured frontend origin(s).
            // Set Cors:AllowedOrigins in environment config or appsettings.Production.json.
            var allowedOrigins = builder.Configuration
                .GetSection("Cors:AllowedOrigins")
                .Get<string[]>() ?? [];
            policy.WithOrigins(allowedOrigins)
                  .AllowAnyMethod()
                  .AllowAnyHeader();
        }
    });
});

var app = builder.Build();

// Database migrations are applied as a manual pre-deployment step, not at startup.
// Run: dotnet ef database update
// (Auto-migration at startup risks race conditions on multi-instance deployments.)

if (rateLimitingOptions.TrustForwardedHeaders)
{
    app.UseForwardedHeaders();
}

app.UseSwagger();
app.UseSwaggerUI();

app.UseMiddleware<ExceptionMiddleware>();

app.UseCors();

app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();

app.MapControllers();

app.Run();

public partial class Program { }
