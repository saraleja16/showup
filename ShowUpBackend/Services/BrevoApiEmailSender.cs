using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;
using ShowUpBackend.Configuration;
using ShowUpBackend.Services.Interfaces;

namespace ShowUpBackend.Services;

public class BrevoApiEmailSender : IEmailSender
{
    private readonly EmailOptions _options;
    private readonly HttpClient _httpClient;
    private readonly ILogger<BrevoApiEmailSender> _logger;

    public BrevoApiEmailSender(
        IOptions<EmailOptions> options,
        HttpClient httpClient,
        ILogger<BrevoApiEmailSender> logger)
    {
        _options = options.Value;
        _httpClient = httpClient;
        _logger = logger;
    }

    public async Task SendAsync(
        string toAddress,
        string subject,
        string htmlBody,
        string textBody,
        CancellationToken cancellationToken = default)
    {
        var payload = new
        {
            sender = new
            {
                name = _options.FromName,
                email = _options.FromAddress
            },
            to = new[]
            {
                new { email = toAddress }
            },
            subject,
            htmlContent = htmlBody,
            textContent = textBody
        };

        var json = JsonSerializer.Serialize(payload);

        using var request = new HttpRequestMessage(
            HttpMethod.Post,
            "https://api.brevo.com/v3/smtp/email");

        request.Headers.Add("api-key", _options.BrevoApiKey);
        request.Headers.Accept.Add(
            new MediaTypeWithQualityHeaderValue("application/json"));

        request.Content = new StringContent(
            json,
            Encoding.UTF8,
            "application/json");

        using var response = await _httpClient.SendAsync(
            request,
            cancellationToken);

        var responseBody = await response.Content.ReadAsStringAsync(
            cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            _logger.LogError(
                "Brevo API failed with status {StatusCode}: {Response}",
                response.StatusCode,
                responseBody);

            throw new EmailDeliveryException(
                $"Brevo API returned {(int)response.StatusCode}.");
        }

        _logger.LogInformation(
            "Sent email to {Recipient} via Brevo API",
            toAddress);
    }
}
