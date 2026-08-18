import logging

import resend

from app.config import settings

logger = logging.getLogger(__name__)


def send_password_reset_email(to_email: str, reset_url: str) -> None:
    """
    Sends the reset link via Resend. If RESEND_API_KEY isn't configured
    (e.g. local dev without an account set up yet), logs the link instead
    of failing the request - so forgot-password still "works" locally by
    reading it out of the server console, without needing an email account
    just to test the flow.
    """
    if not settings.resend_api_key:
        logger.warning("RESEND_API_KEY not set - password reset link (not emailed): %s", reset_url)
        return

    resend.api_key = settings.resend_api_key
    resend.Emails.send({
        "from": settings.resend_from_email,
        "to": [to_email],
        "subject": "Reset your Kindling password",
        "html": f"""
            <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
                <h2 style="color: #2D2D2D;">Reset your password</h2>
                <p style="color: #4A4A4A;">
                    Someone requested a password reset for this email on Kindling.
                    If this was you, click below to set a new password - this link
                    expires in 1 hour and can only be used once.
                </p>
                <p style="margin: 32px 0;">
                    <a href="{reset_url}"
                       style="background: #F4978E; color: white; padding: 12px 28px;
                              border-radius: 100px; text-decoration: none; font-weight: 500;">
                        Reset password
                    </a>
                </p>
                <p style="color: #8E8E8E; font-size: 13px;">
                    If you didn't request this, you can safely ignore this email -
                    your password won't be changed.
                </p>
            </div>
        """,
    })