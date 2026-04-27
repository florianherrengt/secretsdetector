import { z } from 'zod';
import type { FC, PropsWithChildren } from 'hono/jsx';
import { AuthNavActions } from './components/AuthNavActions.js';

type LayoutProps = PropsWithChildren<{
	title: string;
	autoRefreshSeconds?: number;
	topNavMode?: 'auth' | 'app';
}>;

export const Layout: FC<LayoutProps> = z
	.function()
	.args(z.custom<LayoutProps>())
	.returns(z.custom<ReturnType<FC<LayoutProps>>>())
	.implement(({ title, children, autoRefreshSeconds, topNavMode }) => {
		const navMode = topNavMode ?? 'auth';

		return (
			<html lang="en">
				<head>
					<meta charset="utf-8" />
					<meta name="viewport" content="width=device-width, initial-scale=1" />
					{typeof autoRefreshSeconds === 'number' && autoRefreshSeconds > 0 ? (
						<meta http-equiv="refresh" content={String(autoRefreshSeconds)} />
					) : null}
					<title>{title} | Secrets Watch</title>
					<link rel="stylesheet" href="/assets/app.css" />
					<script src="/assets/timezone-render.js"></script>
					{/* load posthog */}
					<script
						dangerouslySetInnerHTML={{
							__html: `!function(t,e){var o,n,p,r;e.__SV||(window.posthog && window.posthog.__loaded)||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="Ai Ri init Vi Yi Rr zi Gi Zi capture calculateEventProperties en register register_once register_for_session unregister unregister_for_session sn getFeatureFlag getFeatureFlagPayload getFeatureFlagResult isFeatureEnabled reloadFeatureFlags updateFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSurveysLoaded onSessionId getSurveys getActiveMatchingSurveys renderSurvey displaySurvey cancelPendingSurvey canRenderSurvey canRenderSurveyAsync an identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset setIdentity clearIdentity get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException addExceptionStep captureLog startExceptionAutocapture stopExceptionAutocapture loadToolbar get_property getSessionProperty rn Ki createPersonProfile setInternalOrTestUser nn $i hn opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing get_explicit_consent_status is_capturing clear_opt_in_out_capturing Xi debug Mr tn getPageViewId captureTraceFeedback captureTraceMetric Di".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);posthog.init('phc_CZVAkVhYfNqe74cN5QRKDUgpZRXSPneg8YJWTwupxzi9',{api_host:'https://eu.i.posthog.com',defaults:'2026-01-30',person_profiles:'identified_only'})`,
						}}
					/>
				</head>
				<body class="mx-auto max-w-4xl bg-background p-8 font-sans text-foreground">
					<nav class="mb-6 flex items-center justify-between border-b border-border pb-2">
						<strong>Secrets Watch</strong>
						<AuthNavActions mode={navMode} />
					</nav>
					{children}
				</body>
			</html>
		);
	});
