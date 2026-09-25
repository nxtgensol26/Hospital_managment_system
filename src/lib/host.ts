// Host detection for the dedicated Patient Portal subdomain.
//
// When the app is served from `patient.<main-domain>`, the site root ("/")
// should open the Patient Portal instead of the staff workspace. This is
// domain-agnostic: it matches ANY hostname beginning with "patient." so no
// specific production domain is hard-coded or assumed. An exact host can be
// pinned with the optional VITE_PATIENT_HOST env var if ever needed.
export function isPatientHost(): boolean {
  try {
    const host = window.location.hostname.toLowerCase()
    const override = (import.meta.env.VITE_PATIENT_HOST as string | undefined)?.toLowerCase()
    if (override) return host === override
    return host === 'patient' || host.startsWith('patient.')
  } catch {
    return false
  }
}
