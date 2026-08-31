using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Options;
using ShowUpBackend.Configuration;
using ShowUpBackend.Models.Entities;
using ShowUpBackend.Repositories.Interfaces;
using ShowUpBackend.Services.Interfaces;

namespace ShowUpBackend.Services;

public class OtpService : IOtpService
{
    private readonly IEmailOtpRepository _otpRepository;
    private readonly IUserRepository _userRepository;
    private readonly IEmailSender _emailSender;
    private readonly EmailOptions _options;
    private readonly ILogger<OtpService> _logger;

    public OtpService(
        IEmailOtpRepository otpRepository,
        IUserRepository userRepository,
        IEmailSender emailSender,
        IOptions<EmailOptions> options,
        ILogger<OtpService> logger)
    {
        _otpRepository = otpRepository;
        _userRepository = userRepository;
        _emailSender = emailSender;
        _options = options.Value;
        _logger = logger;
    }

    public async Task<OtpSendResult> SendEmailVerificationAsync(string email, CancellationToken cancellationToken = default)
    {
        var normalizedEmail = Normalize(email);
        if (string.IsNullOrWhiteSpace(normalizedEmail))
        {
            return OtpSendResult.UnknownEmail;
        }

        var user = await FindUserAsync(normalizedEmail);
        if (user is null)
        {
            return OtpSendResult.UnknownEmail;
        }

        if (user.IsEmailVerified)
        {
            return OtpSendResult.AlreadyVerified;
        }

        var windowStart = DateTime.UtcNow.AddMinutes(-_options.OtpRateLimitWindowMinutes);
        var recentSends = await _otpRepository.CountSentSinceAsync(normalizedEmail, OtpPurposes.EmailVerification, windowStart);
        if (recentSends >= _options.OtpMaxSendsPerWindow)
        {
            _logger.LogWarning("OTP send rate limit hit for {Email}", normalizedEmail);
            return OtpSendResult.RateLimited;
        }

        // Only the newest code should ever be valid.
        await _otpRepository.InvalidateOutstandingAsync(normalizedEmail, OtpPurposes.EmailVerification);

        var code = GenerateCode();

        await _otpRepository.AddAsync(new EmailOtp
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            Email = normalizedEmail,
            CodeHash = HashCode(normalizedEmail, code),
            Purpose = OtpPurposes.EmailVerification,
            ExpiresAt = DateTime.UtcNow.AddMinutes(_options.OtpExpiryMinutes),
            AttemptCount = 0,
            CreatedAt = DateTime.UtcNow
        });

        var firstName = string.IsNullOrWhiteSpace(user.FirstName) ? "there" : user.FirstName;

        await _emailSender.SendAsync(
            normalizedEmail,
            "Your ShowUp verification code",
            BuildHtmlBody(firstName, code, _options.OtpExpiryMinutes),
            BuildTextBody(firstName, code, _options.OtpExpiryMinutes),
            cancellationToken);

        return OtpSendResult.Sent;
    }

    public async Task<(OtpVerifyResult Result, User? User)> VerifyEmailAsync(
        string email,
        string code,
        CancellationToken cancellationToken = default)
    {
        var normalizedEmail = Normalize(email);
        var normalizedCode = (code ?? string.Empty).Trim();

        var user = await FindUserAsync(normalizedEmail);
        if (user is null)
        {
            return (OtpVerifyResult.UnknownEmail, null);
        }

        if (user.IsEmailVerified)
        {
            return (OtpVerifyResult.AlreadyVerified, user);
        }

        var otp = await _otpRepository.GetLatestActiveAsync(normalizedEmail, OtpPurposes.EmailVerification);
        if (otp is null)
        {
            return (OtpVerifyResult.NoCodeIssued, null);
        }

        if (otp.ExpiresAt <= DateTime.UtcNow)
        {
            return (OtpVerifyResult.Expired, null);
        }

        if (otp.AttemptCount >= _options.OtpMaxAttempts)
        {
            // Burn the code so a fresh one must be requested.
            otp.ConsumedAt = DateTime.UtcNow;
            await _otpRepository.UpdateAsync(otp);
            return (OtpVerifyResult.TooManyAttempts, null);
        }

        var submittedHash = HashCode(normalizedEmail, normalizedCode);
        var matches = CryptographicOperations.FixedTimeEquals(
            Encoding.UTF8.GetBytes(submittedHash),
            Encoding.UTF8.GetBytes(otp.CodeHash));

        if (!matches)
        {
            otp.AttemptCount++;

            // Burn the code on the attempt that hits the cap, so a brute-forcer can't keep
            // probing and the user is told immediately to request a new one.
            var exhausted = otp.AttemptCount >= _options.OtpMaxAttempts;
            if (exhausted)
            {
                otp.ConsumedAt = DateTime.UtcNow;
            }

            await _otpRepository.UpdateAsync(otp);

            return exhausted
                ? (OtpVerifyResult.TooManyAttempts, null)
                : (OtpVerifyResult.IncorrectCode, null);
        }

        otp.ConsumedAt = DateTime.UtcNow;
        await _otpRepository.UpdateAsync(otp);

        user.IsEmailVerified = true;
        user.EmailVerifiedAt = DateTime.UtcNow;
        await _userRepository.UpdateUserAsync(user);

        return (OtpVerifyResult.Success, user);
    }

    private async Task<User?> FindUserAsync(string normalizedEmail)
    {
        // Emails are stored as the user typed them, so match case-insensitively.
        return await _userRepository.FindByEmailInsensitiveAsync(normalizedEmail);
    }

    private static string Normalize(string? email) => (email ?? string.Empty).Trim().ToLowerInvariant();

    private static string GenerateCode()
    {
        // Cryptographically secure, uniformly distributed across 000000-999999.
        return RandomNumberGenerator.GetInt32(0, 1_000_000).ToString("D6");
    }

    private static string HashCode(string email, string code)
    {
        // Email acts as a per-user salt so identical codes never share a hash.
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes($"{email}:{code}"));
        return Convert.ToBase64String(bytes);
    }

    private static string BuildTextBody(string firstName, string code, int expiryMinutes) =>
        $"""
        Hi {firstName},

        Your ShowUp verification code is: {code}

        It expires in {expiryMinutes} minutes.

        If you didn't create a ShowUp account, you can ignore this email.

        — The ShowUp team
        """;

    private static string BuildHtmlBody(string firstName, string code, int expiryMinutes) =>
        $"""
        <!DOCTYPE html>
        <html>
          <body style="margin:0;padding:24px;background:#f5f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a1a;">
            <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;">
              <h1 style="margin:0 0 16px;font-size:20px;">Verify your email</h1>
              <p style="margin:0 0 24px;font-size:15px;line-height:1.5;color:#444;">
                Hi {firstName}, use this code to finish setting up your ShowUp account.
              </p>
              <div style="font-size:32px;font-weight:700;letter-spacing:8px;text-align:center;padding:16px;background:#f0f2f5;border-radius:8px;">
                {code}
              </div>
              <p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:#777;">
                This code expires in {expiryMinutes} minutes. If you didn't create a ShowUp account, you can safely ignore this email.
              </p>
            </div>
          </body>
        </html>
        """;
}
