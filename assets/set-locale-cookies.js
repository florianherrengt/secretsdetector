document.cookie = "tz=" + Intl.DateTimeFormat().resolvedOptions().timeZone + ";path=/;samesite=lax";
document.cookie = "locale=" + (navigator.language || "en") + ";path=/;samesite=lax";
