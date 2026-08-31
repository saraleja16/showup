using MailKit.Net.Smtp;
using MailKit.Security;
using Microsoft.Extensions.Options;
using MimeKit;
using ShowUpBackend.Configuration;
using ShowUpBackend.Services.Interfaces;

namespace ShowUpBackend.Services;

/// <summary>
/// Sends mail over SMTP. Configured for Brevo by default, but this is plain SMTP —
/// swapping to any other provider is a config change, not a code change.
/// </summary>
public class SmtpEmailSender : IEmailSender
{
    private readonly EmailOptions _options;
    private readonly ILogger<SmtpEmailSender> _logger;

    public SmtpEmailSender(IOptions<EmailOptions> options, ILogger<SmtpEmailSender> logger)
    {
        _options = options.Value;
        _logger = logger;
    }

    public async Task SendAsync(
        string toAddress,
        string subject,
        string htmlBody,
        string textBody,
        CancellationToken cancellationToken = default)
    {
        var message = new MimeMessage();
        message.From.Add(new MailboxAddress(_options.FromName, _options.FromAddress));
        message.To.Add(MailboxAddress.Parse(toAddress));
        message.Subject = subject;
        message.Body = new BodyBuilder
        {
            HtmlBody = htmlBody,
            TextBody = textBody
        }.ToMessageBody();

        using var client = new SmtpClient
        {
            // The chain and hostname are still validated; this only skips the separate
            // CRL/OCSP revocation lookup, which often can't complete on macOS.
            CheckCertificateRevocation = _options.CheckCertificateRevocation
        };

        // Port 465 is implicit TLS; everything else (587) negotiates STARTTLS.
        var socketOptions = _options.SmtpPort == 465
            ? SecureSocketOptions.SslOnConnect
            : SecureSocketOptions.StartTls;

        try
        {
            await client.ConnectAsync(_options.SmtpHost, _options.SmtpPort, socketOptions, cancellationToken);
            await client.AuthenticateAsync(_options.SmtpUser, _options.SmtpPassword, cancellationToken);
            await client.SendAsync(message, cancellationToken);
        }
        finally
        {
            if (client.IsConnected)
            {
                await client.DisconnectAsync(true, cancellationToken);
            }
        }

        _logger.LogInformation("Sent email to {Recipient} with subject {Subject}", toAddress, subject);
    }
}
