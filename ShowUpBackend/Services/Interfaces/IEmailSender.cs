namespace ShowUpBackend.Services.Interfaces;

public interface IEmailSender
{
    Task SendAsync(string toAddress, string subject, string htmlBody, string textBody, CancellationToken cancellationToken = default);
}
