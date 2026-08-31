namespace ShowUpBackend.Configuration;

public class GoogleAuthOptions
{
    public const string SectionName = "GoogleAuth";

    /// <summary>
    /// Google OAuth Web Client ID used as the expected ID token audience.
    /// Loaded from GoogleAuth__WebClientId / GoogleAuth:WebClientId.
    /// </summary>
    public string WebClientId { get; set; } = string.Empty;
}
