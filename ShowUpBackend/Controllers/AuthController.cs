using Google.Apis.Auth;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Options;
using ShowUpBackend.Configuration;
using ShowUpBackend.Helpers;
using ShowUpBackend.Models.DTOs;
using ShowUpBackend.Services.Interfaces;

namespace ShowUpBackend.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly IAuthService _authService;
    private readonly IConfiguration _configuration;
    private readonly IOtpService _otpService;
    private readonly ITokenService _tokenService;
    private readonly EmailOptions _emailOptions;

    public AuthController(
        IAuthService authService,
        IConfiguration configuration,
        IOtpService otpService,
        ITokenService tokenService,
        IOptions<EmailOptions> emailOptions)
    {
        _authService = authService;
        _configuration = configuration;
        _otpService = otpService;
        _tokenService = tokenService;
        _emailOptions = emailOptions.Value;
    }

    [HttpPost("register")]
    [EnableRateLimiting(RateLimitPolicies.AuthRegister)]
    public async Task<IActionResult> Register([FromBody] RegisterUserRequest request)
    {
        var (user, error, statusCode) = await _authService.RegisterAsync(request);

        if (user is null)
        {
            return StatusCode(statusCode, new { message = error });
        }

        return StatusCode(statusCode, user);
    }

    [HttpPost("login")]
    [EnableRateLimiting(RateLimitPolicies.AuthLogin)]
    public async Task<IActionResult> Login([FromBody] LoginUserRequest request)
    {
        var (user, statusCode) = await _authService.LoginAsync(request);

        if (user is null)
        {
            // Generic message — do not reveal whether email exists.
            return Unauthorized(new { message = "Invalid email or password." });
        }

        return Ok(user);
    }

    /// <summary>
    /// Emails a fresh 6-digit verification code. Responds 200 regardless of whether the
    /// address is registered or already verified, so it can't be used to enumerate accounts.
    /// </summary>
    [HttpPost("send-verification-code")]
    public async Task<IActionResult> SendVerificationCode([FromBody] SendVerificationCodeRequest request)
    {
        if (!ModelState.IsValid)
        {
            return BadRequest(new { message = "A valid email address is required" });
        }

        var result = await _otpService.SendEmailVerificationAsync(request.Email);

        if (result == OtpSendResult.RateLimited)
        {
            return StatusCode(StatusCodes.Status429TooManyRequests, new
            {
                message = "Too many codes requested. Please wait a few minutes and try again.",
                retryAfterSeconds = _emailOptions.OtpRateLimitWindowMinutes * 60
            });
        }

        return Ok(new SendVerificationCodeResponse
        {
            Sent = true,
            RetryAfterSeconds = 60,
            Message = "If that email needs verifying, a code is on its way."
        });
    }

    /// <summary>Redeems a verification code and returns the refreshed user with a new access token.</summary>
    [HttpPost("verify-email")]
    public async Task<IActionResult> VerifyEmail([FromBody] VerifyEmailRequest request)
    {
        if (!ModelState.IsValid)
        {
            return BadRequest(new { message = "Enter the 6-digit code from your email", code = "invalid_request" });
        }

        var (result, user) = await _otpService.VerifyEmailAsync(request.Email, request.Code);

        switch (result)
        {
            case OtpVerifyResult.Success:
            case OtpVerifyResult.AlreadyVerified:
                var response = UserMapper.ToAuthResponse(user!);
                response.AccessToken = _tokenService.CreateAccessToken(user!);
                return Ok(response);

            case OtpVerifyResult.Expired:
                return BadRequest(new { message = "That code has expired. Request a new one.", code = "expired" });

            case OtpVerifyResult.TooManyAttempts:
                return BadRequest(new { message = "Too many incorrect attempts. Request a new code.", code = "too_many_attempts" });

            case OtpVerifyResult.NoCodeIssued:
                return BadRequest(new { message = "No active code for this email. Request a new one.", code = "no_code" });

            default:
                // UnknownEmail is deliberately indistinguishable from a wrong code.
                return BadRequest(new { message = "That code isn't right. Check it and try again.", code = "incorrect_code" });
        }
    }

    [HttpPost("google")]
    public async Task<IActionResult> Google([FromBody] GoogleLoginRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.IdToken))
        {
            return BadRequest(new { message = "Missing idToken" });
        }

        var webClientId = _configuration["GoogleAuth:WebClientId"]
            ?? Environment.GetEnvironmentVariable("GoogleAuth__WebClientId")
            ?? Environment.GetEnvironmentVariable("EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID");

        if (string.IsNullOrWhiteSpace(webClientId))
        {
            return Unauthorized(new { message = "Invalid Google token" });
        }

        try
        {
            var payload = await GoogleJsonWebSignature.ValidateAsync(
                request.IdToken,
                new GoogleJsonWebSignature.ValidationSettings
                {
                    Audience = [webClientId]
                });

            var (user, error, statusCode) = await _authService.GoogleLoginAsync(
                payload.Email,
                payload.GivenName,
                payload.FamilyName,
                payload.Name,
                payload.Picture);
            if (user is null)
            {
                return StatusCode(statusCode, new { message = error });
            }

            return Ok(user);
        }
        catch (InvalidJwtException)
        {
            return Unauthorized(new { message = "Invalid Google token" });
        }
    }
}
