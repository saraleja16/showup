namespace ShowUpBackend.Configuration;

public class JwtOptions
{
    public const string SectionName = "Jwt";

    public string Issuer { get; set; } = "ShowUp";
    public string Audience { get; set; } = "ShowUpApp";
    public string Key { get; set; } = string.Empty;
    public int ExpirationMinutes { get; set; } = 10080; // 7 days
}
