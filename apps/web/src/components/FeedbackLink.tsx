import "./feedback.css";

/** Public submission form only; no account or play data is added to the URL. */
export const HERO_FEEDBACK_FORM_URL = "https://secondlifelol.notion.site/147e51907ccf4bbb9060816817335bb3?pvs=105";

export function FeedbackLink() {
  return <a className="feedback-link" href={HERO_FEEDBACK_FORM_URL} target="_blank" rel="noopener noreferrer">
    사용자 의견 남기기 <span className="mini-copy">· 새 탭</span>
  </a>;
}
