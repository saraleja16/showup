namespace ShowUpBackend.Configuration;

public class RateLimitingOptions
{
    public const string SectionName = "RateLimiting";

    /// <summary>Max login attempts per client IP within the login window.</summary>
    public int LoginPermitLimit { get; set; } = 5;

    /// <summary>Login fixed-window length in seconds (default 60 = 1 minute).</summary>
    public int LoginWindowSeconds { get; set; } = 60;

    /// <summary>Max registrations per client IP within the register window.</summary>
    public int RegisterPermitLimit { get; set; } = 3;

    /// <summary>Register fixed-window length in seconds (default 600 = 10 minutes).</summary>
    public int RegisterWindowSeconds { get; set; } = 600;

    /// <summary>Max username/email availability checks per client IP within the window.</summary>
    public int AvailabilityPermitLimit { get; set; } = 30;

    /// <summary>Availability fixed-window length in seconds (default 60 = 1 minute).</summary>
    public int AvailabilityWindowSeconds { get; set; } = 60;

    /// <summary>
    /// When true, enable ForwardedHeaders so RemoteIpAddress reflects X-Forwarded-For
    /// from proxies listed in <see cref="KnownProxies"/>. Default false — do not trust
    /// client-supplied forwarding headers unless proxies are configured.
    /// </summary>
    public bool TrustForwardedHeaders { get; set; }

    /// <summary>Proxy IPs allowed to set X-Forwarded-For when TrustForwardedHeaders is true.</summary>
    public string[] KnownProxies { get; set; } = [];
}

public static class RateLimitPolicies
{
    public const string AuthLogin = "auth-login";
    public const string AuthRegister = "auth-register";
    public const string AuthAvailability = "auth-availability";
}
