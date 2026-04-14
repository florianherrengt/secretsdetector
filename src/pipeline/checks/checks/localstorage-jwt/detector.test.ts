import { describe, it, expect } from "vitest";
import { findLocalStorageJwtDetections } from "./detector.js";

describe("findLocalStorageJwtDetections", () => {
	it("detects localStorage.setItem with token key and identifier value", () => {
		const detections = findLocalStorageJwtDetections(
			'localStorage.setItem("token", authToken);'
		);
		expect(detections).toHaveLength(1);
		expect(detections[0]?.value).toContain("key=token");
		expect(detections[0]?.value).toContain("value=identifier");
	});

	it("detects localStorage.setItem with token key and JWT literal value", () => {
		const detections = findLocalStorageJwtDetections(
			'localStorage.setItem("token", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhY2NvdW50Ijoic2VjcmV0LWRldGVjdG9yIiwiZXhwIjo0MTAyNDQ0ODAwfQ.5Vf2Idz6bVXwAxf6w7wJiv-LQvVv9dQ9Qz2nUtsL0hE");'
		);
		expect(detections).toHaveLength(1);
		expect(detections[0]?.value).toContain("key=token");
		expect(detections[0]?.value).toContain("value=jwt-literal");
	});

	it("detects window.localStorage.setItem with access_token key", () => {
		const detections = findLocalStorageJwtDetections(
			'window.localStorage.setItem("access_token", tokenVar);'
		);
		expect(detections).toHaveLength(1);
		expect(detections[0]?.value).toContain("key=accesstoken");
	});

	it("detects globalThis.localStorage.setItem with jwt key", () => {
		const detections = findLocalStorageJwtDetections(
			'globalThis.localStorage.setItem("jwt", myJwt);'
		);
		expect(detections).toHaveLength(1);
		expect(detections[0]?.value).toContain("key=jwt");
	});

	it("detects bracket assignment with token key", () => {
		const detections = findLocalStorageJwtDetections(
			'localStorage["token"] = myToken;'
		);
		expect(detections).toHaveLength(1);
		expect(detections[0]?.value).toContain("sink=localStorage.bracket");
	});

	it("detects window.localStorage bracket assignment", () => {
		const detections = findLocalStorageJwtDetections(
			'window.localStorage["jwt"] = jwtValue;'
		);
		expect(detections).toHaveLength(1);
	});

	it("detects single-quoted key", () => {
		const detections = findLocalStorageJwtDetections(
			"localStorage.setItem('refresh_token', rt);"
		);
		expect(detections).toHaveLength(1);
		expect(detections[0]?.value).toContain("key=refreshtoken");
	});

	it("detects with extra whitespace", () => {
		const detections = findLocalStorageJwtDetections(
			'localStorage . setItem ( "token" , tokenVar ) ;'
		);
		expect(detections).toHaveLength(1);
	});

	it("detects with JWT literal value even with non-token key (Rule B)", () => {
		const detections = findLocalStorageJwtDetections(
			'localStorage.setItem("cacheKey", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhY2NvdW50Ijoic2VjcmV0LWRldGVjdG9yIiwiZXhwIjo0MTAyNDQ0ODAwfQ.5Vf2Idz6bVXwAxf6w7wJiv-LQvVv9dQ9Qz2nUtsL0hE");'
		);
		expect(detections).toHaveLength(1);
		expect(detections[0]?.value).toContain("value=jwt-literal");
	});

	it("detects with token-like value identifier (Rule C)", () => {
		const detections = findLocalStorageJwtDetections(
			'localStorage.setItem("data", token);'
		);
		expect(detections).toHaveLength(1);
		expect(detections[0]?.value).toContain("value=identifier");
	});

	it("ignores sessionStorage.setItem", () => {
		const detections = findLocalStorageJwtDetections(
			'sessionStorage.setItem("token", authToken);'
		);
		expect(detections).toHaveLength(0);
	});

	it("ignores localStorage.getItem", () => {
		const detections = findLocalStorageJwtDetections(
			'localStorage.getItem("token");'
		);
		expect(detections).toHaveLength(0);
	});

	it("ignores localStorage.removeItem", () => {
		const detections = findLocalStorageJwtDetections(
			'localStorage.removeItem("token");'
		);
		expect(detections).toHaveLength(0);
	});

	it("ignores localStorage.clear", () => {
		const detections = findLocalStorageJwtDetections("localStorage.clear();");
		expect(detections).toHaveLength(0);
	});

	it("ignores non-token key with non-token value", () => {
		const detections = findLocalStorageJwtDetections(
			'localStorage.setItem("theme", "dark");'
		);
		expect(detections).toHaveLength(0);
	});

	it("ignores non-token key with non-token identifier value", () => {
		const detections = findLocalStorageJwtDetections(
			'localStorage.setItem("config", someValue);'
		);
		expect(detections).toHaveLength(0);
	});

	it("ignores non-token bracket assignment", () => {
		const detections = findLocalStorageJwtDetections(
			'localStorage["theme"] = "dark";'
		);
		expect(detections).toHaveLength(0);
	});

	it("ignores template literal with interpolation", () => {
		const detections = findLocalStorageJwtDetections(
			"localStorage.setItem(`token`, `${getToken()}`);"
		);
		expect(detections).toHaveLength(0);
	});

	it("detects plain template literal without interpolation", () => {
		const detections = findLocalStorageJwtDetections(
			"localStorage.setItem(`token`, jwtVar);"
		);
		expect(detections).toHaveLength(1);
	});

	it("returns empty for empty body", () => {
		const detections = findLocalStorageJwtDetections("");
		expect(detections).toHaveLength(0);
	});

	it("returns empty when no matches", () => {
		const detections = findLocalStorageJwtDetections(
			'console.log("hello world");'
		);
		expect(detections).toHaveLength(0);
	});

	it("detects multiple writes in one body", () => {
		const detections = findLocalStorageJwtDetections(
			'localStorage.setItem("token", t1); localStorage.setItem("jwt", t2);'
		);
		expect(detections).toHaveLength(2);
	});

	it("deduplicates same position", () => {
		const detections = findLocalStorageJwtDetections(
			'localStorage.setItem("token", token);'
		);
		expect(detections).toHaveLength(1);
	});

	it("detects id_token key", () => {
		const detections = findLocalStorageJwtDetections(
			'localStorage.setItem("id_token", idToken);'
		);
		expect(detections).toHaveLength(1);
		expect(detections[0]?.value).toContain("key=idtoken");
	});

	it("detects auth_token key", () => {
		const detections = findLocalStorageJwtDetections(
			'localStorage.setItem("auth_token", val);'
		);
		expect(detections).toHaveLength(1);
		expect(detections[0]?.value).toContain("key=authtoken");
	});

	it("detects bearer_token key", () => {
		const detections = findLocalStorageJwtDetections(
			'localStorage.setItem("bearer_token", val);'
		);
		expect(detections).toHaveLength(1);
		expect(detections[0]?.value).toContain("key=bearertoken");
	});

	it("detects session_token key", () => {
		const detections = findLocalStorageJwtDetections(
			'localStorage.setItem("session_token", val);'
		);
		expect(detections).toHaveLength(1);
		expect(detections[0]?.value).toContain("key=sessiontoken");
	});

	it("detects case-insensitive key Token", () => {
		const detections = findLocalStorageJwtDetections(
			'localStorage.setItem("Token", val);'
		);
		expect(detections).toHaveLength(1);
	});

	it("detects case-insensitive key ACCESS_TOKEN", () => {
		const detections = findLocalStorageJwtDetections(
			'localStorage.setItem("ACCESS_TOKEN", val);'
		);
		expect(detections).toHaveLength(1);
	});

	it("detects hyphenated key access-token normalizing to accesstoken", () => {
		const detections = findLocalStorageJwtDetections(
			'localStorage.setItem("access-token", val);'
		);
		expect(detections).toHaveLength(1);
	});

	it("detects minified setItem with no spaces", () => {
		const detections = findLocalStorageJwtDetections(
			'localStorage.setItem("token",token)'
		);
		expect(detections).toHaveLength(1);
	});

	it("detects minified member-expression key for token storage", () => {
		const detections = findLocalStorageJwtDetections(
			"localStorage.setItem(Jo.token,l.renewToken)}}),localStorage.setItem(Jo.token,i.signIn),localStorage.setItem(Jo.token,s.signUpWithWebflow)"
		);
		expect(detections).toHaveLength(3);
	});

	it("ignores non-token member-expression key like selectedOrganisationId", () => {
		const detections = findLocalStorageJwtDetections(
			"localStorage.setItem(Jo.selectedOrganisationId,u)}})"
		);
		expect(detections).toHaveLength(0);
	});

	it("detects nocodelytics-style minified token write and ignores selectedOrganisationId", () => {
		const body =
			"{width:1e3,height:1e3,ref:e}))},nX=({from:e})=>m.createElement(ji,{to:{pathname:qe.signIn,state:{from:e}}}),da=({children:e,...t})=>{var o,s;const[n,r]=Rke({onCompleted:async l=>{localStorage.setItem(Jo.token,l.renewToken)}}),a=pp({onCompleted:l=>{var d,f;if(!((d=l.me)!=null&&d.user.id))return;r.called||n();const u=(f=Sr.first(l.me.organisations))==null?void 0:f.id;u&&localStorage.setItem(Jo.selectedOrganisationId,u)}}),i=(s=(o=a.data)==null?void 0:o.me)==null?void 0:s.user;return m.createElement(Mo,{...t,render:({location:l})=>{var u;if(a.error)return(u=a.error)!=null&&u.graphQLErrors.some(({extensions:d})=";

		const detections = findLocalStorageJwtDetections(body);
		expect(detections).toHaveLength(1);
		expect(detections[0]?.value).toContain("key=jotoken");
		expect(detections[0]?.value).toContain("sink=localStorage.setItem");
		expect(body.slice(detections[0]?.start, detections[0]?.end)).toContain(
			"localStorage.setItem(Jo.token,l.renewToken)"
		);
	});

	it("sets start and end to full match span", () => {
		const body = 'localStorage.setItem("token", token);';
		const detections = findLocalStorageJwtDetections(body);
		expect(detections).toHaveLength(1);
		expect(body.slice(detections[0]?.start, detections[0]?.end)).toBe(
			'localStorage.setItem("token", token)'
		);
	});
});
