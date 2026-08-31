using ShowUpBackend.Services.Interfaces;

namespace ShowUpBackend.Services;

/// <summary>
/// Fallback used when no SMTP credentials are configured. Writes the email body to the
/// application log instead of sending it, so local development works with zero setup —
/// the OTP code appears in the console.
/// </summary>
public class LoggingEmailSender : IEmailSender
{
    private readonly ILogger<LoggingEmailSender> _logger;

    public LoggingEmailSender(ILogger<LoggingEmailSender> logger)
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
        _logger.LogWarning(
            "SMTP is not configured — email NOT sent. Set Email__SmtpUser / Email__SmtpPassword / Email__FromAddress to enable delivery.\n" +
            "--- EMAIL ---\nTo: {Recipient}\nSubject: {Subject}\n{Body}\n-------------",
            toAddress,
            subject,
            textBody);

        return Task.CompletedTask;
    }
}
