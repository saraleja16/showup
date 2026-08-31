using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace ShowUpBackend.Filters;

// TODO: Replace X-Admin-Key header check with Firebase admin claims verification
// once Firebase Auth is reinstated (see auth revert task).
public class AdminKeyFilter : IAsyncActionFilter
{
    private readonly IConfiguration _configuration;

    public AdminKeyFilter(IConfiguration configuration)
    {
        _configuration = configuration;
    }

    public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        var provided = context.HttpContext.Request.Headers["X-Admin-Key"].FirstOrDefault();
        var expected = _configuration["AdminApiKey"];

        var unauthorized = new ObjectResult(new { message = "unauthorized" })
        {
            StatusCode = StatusCodes.Status401Unauthorized
        };

        if (string.IsNullOrEmpty(provided) || string.IsNullOrEmpty(expected))
        {
            context.Result = unauthorized;
            return;
        }

        var providedBytes = Encoding.UTF8.GetBytes(provided);
        var expectedBytes = Encoding.UTF8.GetBytes(expected);

        if (providedBytes.Length != expectedBytes.Length ||
            !CryptographicOperations.FixedTimeEquals(providedBytes, expectedBytes))
        {
            context.Result = unauthorized;
            return;
        }

        await next();
    }
}
