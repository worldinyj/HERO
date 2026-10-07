import { Link } from "react-router";

function LegalHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <header className="panel legal-header">
      <div className="legal-topline">
        <p className="eyebrow">{eyebrow}</p>
        <span className="draft-badge">검토 초안</span>
      </div>
      <h2>{title}</h2>
      <p className="muted">{description}</p>
      <p className="notice">
        본 문안은 개발·검토용 초안입니다. 운영부서, 개인정보 보호책임자,
        보유기간, 처리위탁·국외이전 등 실제 운영정보 확정 후 법무·개인정보
        담당부서 검토를 거쳐 배포해야 합니다.
      </p>
    </header>
  );
}

function LegalNav() {
  return (
    <nav className="legal-nav" aria-label="약관 및 개인정보">
      <Link to="/terms">이용약관</Link>
      <Link to="/privacy">개인정보 처리방침</Link>
      <Link to="/login">로그인으로</Link>
    </nav>
  );
}

export function TermsPage() {
  return (
    <section className="legal-page" aria-labelledby="terms-title">
      <LegalHeader
        eyebrow="HERO Policy"
        title="HERO 이용약관"
        description="인적오류 예방 학습 시뮬레이션 HERO의 이용 원칙입니다."
      />

      <article className="panel legal-document">
        <h3 id="terms-title">1. 목적과 적용범위</h3>
        <p>
          HERO는 원자력 분야 인적행위와 방어수단을 학습하기 위한 교육용
          시뮬레이션입니다. 초대를 받아 가입한 사용자에게만 제공되며, 실제
          운전·정비·작업 절차나 안전 판단을 대신하지 않습니다.
        </p>

        <h3>2. 계정과 초대</h3>
        <p>
          사용자는 본인에게 발급된 1회용 초대 링크를 이용하여 가입합니다.
          다른 사람의 초대 링크를 사용하거나 계정을 공동 사용하는 행위는
          허용되지 않습니다. 소속·직무 등 가입 정보가 사실과 다른 경우
          담당자가 이용을 제한할 수 있습니다.
        </p>

        <h3>3. 닉네임과 공개 범위</h3>
        <p>
          리더보드에는 실명이 아니라 닉네임, 발전소 표시명, 조직상 직무,
          HP와 순위만 표시됩니다. 부적절하거나 타인을 오인하게 하는
          닉네임은 제한될 수 있으며, 담당자는 해당 닉네임을 초기화할 수
          있습니다.
        </p>

        <h3>4. 학습 결과의 이용 원칙</h3>
        <p className="legal-emphasis">
          HERO의 플레이 결과, HP, 순위, 선택내역과 학습행동 지표는 학습과
          참여를 위한 자료이며 인사평가·징계의 근거로 사용하지 않습니다.
        </p>
        <p>
          발전소담당자에게는 개인 HP, 선택내역, 엔딩, 5대 학습행동 지표를
          제공하지 않으며, 참여·완료 현황과 소규모 집계를 제외한 익명
          통계만 제공합니다.
        </p>

        <h3>5. 안전 관련 주의</h3>
        <p>
          시나리오는 교육 목적의 재구성 자료이며 실제 설비 상태, 현장
          절차, 운전 지시 또는 작업 허가를 대체하지 않습니다. 실제 업무
          중에는 승인된 절차와 지시체계를 우선해야 합니다.
        </p>

        <h3>6. 금지행위</h3>
        <ul>
          <li>타인의 초대 링크·계정·인증정보를 무단으로 사용하는 행위</li>
          <li>점수·순위 또는 결과를 위·변조하거나 시스템을 우회하는 행위</li>
          <li>서비스를 방해하거나 비공개 시나리오·운영정보를 무단 유출하는 행위</li>
          <li>다른 사용자를 사칭하거나 모욕·차별적 닉네임을 사용하는 행위</li>
        </ul>

        <h3>7. 서비스 변경·중단</h3>
        <p>
          안정적인 운영, 보안, 콘텐츠 검수 또는 정책 변경을 위해 서비스
          일부가 변경되거나 일시 중단될 수 있습니다. 중요한 변경은 가능한
          범위에서 사전에 안내합니다.
        </p>

        <h3>8. 문의와 최종 확정</h3>
        <p>
          운영부서 및 문의처: <strong>[운영부서·연락처 확정 필요]</strong>
        </p>
        <p className="legal-meta">초안 버전 0.1 · 기준일 2026-10-07</p>
      </article>

      <LegalNav />
    </section>
  );
}

export function PrivacyPage() {
  return (
    <section className="legal-page" aria-labelledby="privacy-title">
      <LegalHeader
        eyebrow="HERO Privacy"
        title="개인정보 처리방침"
        description="HERO가 처리하는 개인정보와 이용자의 권리를 안내합니다."
      />

      <article className="panel legal-document">
        <h3 id="privacy-title">1. 개인정보 처리 목적</h3>
        <p>
          HERO는 초대 대상 확인, 사용자 인증, 발전소·직무별 교육 운영,
          학습 시뮬레이션 제공, 시즌·리더보드 운영, 보안·감사로그 관리와
          서비스 품질 개선을 위해 필요한 범위에서 개인정보를 처리합니다.
        </p>

        <h3>2. 처리하는 개인정보 항목</h3>
        <dl className="legal-table">
          <div>
            <dt>필수</dt>
            <dd>
              카카오 인증 식별자, 이름, 소속 발전소, 조직상 직무, 닉네임,
              초대·동의 이력
            </dd>
          </div>
          <div>
            <dt>서비스 이용 중 생성</dt>
            <dd>
              접속·감사 기록, 시나리오 세션·결정 로그, HP·학습행동 지표,
              시즌 순위
            </dd>
          </div>
          <div>
            <dt>MVP 미수집</dt>
            <dd>이메일 주소, 전화번호</dd>
          </div>
        </dl>

        <h3>3. 공개되는 정보</h3>
        <p>
          리더보드에는 닉네임, 발전소 표시명, 조직상 직무, HP와 순위만
          공개합니다. 실명, 개인별 선택내역, 엔딩, 5대 학습행동 지표는
          리더보드에 공개하지 않습니다.
        </p>

        <h3>4. 보유 및 이용기간</h3>
        <p>
          회원정보, 교육기록, 감사로그의 구체적인 보유기간은
          <strong> [사내 교육·기록관리·개인정보 정책 확인 후 확정 필요]</strong>
          입니다. 서비스 탈퇴 또는 이용 목적 달성 후에는 법령이나 내부
          규정상 보존 필요가 없는 개인정보를 지체 없이 파기하는 것을
          원칙으로 합니다.
        </p>

        <h3>5. 제3자 제공</h3>
        <p>
          원칙적으로 정보주체의 개인정보를 별도 동의 없이 제3자에게
          제공하지 않습니다. 법령상 근거 또는 별도 동의가 필요한 제공이
          발생하는 경우 제공받는 자, 목적, 항목, 보유기간을 사전에
          고지합니다.
        </p>

        <h3>6. 처리위탁·국외이전</h3>
        <p>
          HERO는 카카오 인증, Supabase 기반 인증·데이터 처리, Cloudflare
          기반 웹 제공을 사용하도록 설계되어 있습니다. 실제 처리위탁자,
          처리장소, 국외이전 여부와 이전국가·항목·시점·방법·보유기간은
          프로덕션 계약과 리전을 확정한 뒤 별도 표로 공개해야 합니다.
        </p>

        <h3>7. 파기 절차와 방법</h3>
        <p>
          보유기간이 끝나거나 처리목적이 달성된 개인정보는 별도 보존
          근거가 없는 경우 복구하기 어렵도록 삭제합니다. 전자적 파일은
          기술적으로 재생이 어렵도록 삭제하고, 출력물이 있는 경우
          분쇄·파쇄 등의 방법을 사용합니다.
        </p>

        <h3>8. 안전성 확보 조치</h3>
        <p>
          역할기반 접근통제, Row Level Security, 서버 전용 서비스 키,
          1회용 초대 토큰의 해시 저장, 감사로그 변경 방지 등 기술적·관리적
          보호조치를 적용하도록 설계합니다.
        </p>

        <h3>9. 정보주체의 권리</h3>
        <p>
          이용자는 관련 법령에 따라 자신의 개인정보에 대한 열람, 정정,
          삭제, 처리정지 등 권리를 행사할 수 있습니다. 구체적인 신청 방법과
          담당 창구는 <strong>[개인정보 담당부서 확정 필요]</strong>입니다.
        </p>

        <h3>10. 개인정보 보호책임자 및 문의</h3>
        <p>
          개인정보 보호책임자 또는 담당부서, 전화번호, 이메일:
          <strong> [확정 필요]</strong>
        </p>

        <h3>11. 변경 안내</h3>
        <p>
          처리방침의 내용이 변경되는 경우 적용일과 주요 변경사항을 서비스
          내에서 안내합니다.
        </p>

        <p className="legal-meta">초안 버전 0.1 · 기준일 2026-10-07</p>
      </article>

      <LegalNav />
    </section>
  );
}
