using ShowUpBackend.Services.Interfaces;

namespace ShowUpBackend.Services;

/// <summary>
/// Production fallback for missing email configuration. Unlike the local logger sender,
/// this fails loudly so users are not told to check an inbox that will never receive mail.
/// </summary>
public class MisconfiguredEmailSender : IEmailSender
{
    private readonly ILogger<MisconfiguredEmailSender> _logger;

    public MisconfiguredEmailSender(ILogger<MisconfiguredEmailSender> logger)
    {
        _logger = logger;
    }

    public Task SendAsync(
        string toAddress,
        string subject,
        string htmlBody,
        string textBody,
        CancellationToken cancellationToken = default)
    {
        _logger.LogError(
            "Email delivery is not configured. Set Email__SmtpUser, Email__SmtpPassword, and Email__FromAddress.");
        throw new EmailDeliveryException("Verification email service is not configured.");
    }
}
