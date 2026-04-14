const pemFixture = `
-----BEGIN PRIVATE KEY-----
abc123supersecretfixturekey
-----END PRIVATE KEY-----
`;

const leakedJwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhY2NvdW50Ijoic2VjcmV0LWRldGVjdG9yIiwiZXhwIjo0MTAyNDQ0ODAwfQ.5Vf2Idz6bVXwAxf6w7wJiv-LQvVv9dQ9Qz2nUtsL0hE";
const credentialUrl = "https://admin:password@internal.api.com";
const apiKey = "V9wQ1zN7mB4cK2rT8yP0sD6fH3jL5xA9";
const AWS_SECRET_ACCESS_KEY = "AKIAIOSFODNN7EXAMPLE";

const Jo = {
  token: "token",
  selectedOrganisationId: "selectedOrganisationId"
};
const l = { renewToken: leakedJwt };
const i = { signIn: leakedJwt };
const s = { signUpWithWebflow: leakedJwt };
const u = "org_123";

globalThis.localStorage.setItem(Jo.token, l.renewToken);
globalThis.localStorage.setItem(Jo.token, i.signIn);
globalThis.localStorage.setItem(Jo.token, s.signUpWithWebflow);
globalThis.localStorage.setItem(Jo.selectedOrganisationId, u);

globalThis.console.log("demo website loaded", {
  pemFixture,
  leakedJwt,
  credentialUrl,
  apiKey,
  AWS_SECRET_ACCESS_KEY
});

//# sourceMappingURL=main.js.map
