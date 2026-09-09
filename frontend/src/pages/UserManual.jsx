import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  Play, Users, Target, BookOpen, Lightbulb, ClipboardList,
  BarChart3, MessageSquare, HelpCircle, FileText, ChevronRight,
  Monitor, BookMarked,
} from 'lucide-react';

// ─── Role-specific video guides ───────────────────────────────────────────────
const ROLE_GUIDES = {
  HR_ADMIN: {
    label: 'HR Admin',
    color: '#C8102E',
    lightBg: '#FEF2F2',
    videos: [
      {
        id: 'create-user',
        title: 'Create a New User Account',
        icon: Users,
        description: 'Learn how to add employees, supervisors, and admins to the platform.',
        embed: 'https://scribehow.com/embed/How_To_Create_A_New_User_Account__AoJMlMkxRJe-ySnMb9fyyA?as=video',
        aspect: '16/12',
      },
      {
        id: 'add-competency',
        title: 'Add a New Competency',
        icon: Target,
        description: 'Create competencies with categories and target group descriptions.',
        embed: 'https://scribehow.com/embed/How_to_Add_a_New_Competency_in_ZB_CAS__vJf77a39QMip3mn2QAiPTw?as=video',
        aspect: '16/12',
      },
      {
        id: 'add-questions',
        title: 'Add Questions to the Question Bank',
        icon: BookOpen,
        description: 'Add, upload, or AI-generate questions for any competency.',
        embed: 'https://scribehow.com/embed/How_To_Add_Questions_To_The_Question_Bank__6A_xDrVgSVeyEizCrHa37A?as=video',
        aspect: '16/12',
      },
      {
        id: 'add-recommendations',
        title: 'Add Recommendations',
        icon: Lightbulb,
        description: 'Set development recommendations per competency level and target group.',
        embed: 'https://scribehow.com/embed/How_To_Add_Recommendations_to_different_competency_level_users__USkb7WdUSke-YJdLoIjW6g?as=video',
        aspect: '16/12',
      },
      {
        id: 'create-assessment',
        title: 'Create a New Assessment',
        icon: ClipboardList,
        description: 'Schedule assessments for departments or specific employees.',
        embed: 'https://scribehow.com/embed/Creating_a_New_Assessment__yfeEs6zrQ_SdXiws6q19JA?as=video',
        aspect: '16/12',
      },
      {
        id: 'filter-results',
        title: 'Navigate & Filter Competency Results',
        icon: FileText,
        description: 'Use advanced filters to analyse and manage employee results.',
        embed: 'https://scribehow.com/embed/How_to_Navigate_and_Filter_Competency_Results__fKx55HXuQky8-OVoVfS0pA?as=video',
        aspect: '16/12',
      },
      {
        id: 'generate-reports',
        title: 'Generate Competency Assessment Reports',
        icon: BarChart3,
        description: 'Explore overview, department, competency, and individual analytics.',
        embed: 'https://scribehow.com/embed/How_to_Generate_Competency_Assessment_Reports__zigxVt70RiqQvECD1VpFqQ?as=video',
        aspect: '16/12',
      },
      {
        id: 'view-feedback',
        title: 'View Survey Feedback Entries',
        icon: MessageSquare,
        description: 'Access and review employee feedback and ratings per assessment.',
        embed: 'https://scribehow.com/embed/How_To_Access_And_View_Survey_Feedback_Entries__7mAvnRu0QxiwtXpzqanDzw?as=video',
        aspect: '1/1',
      },
      {
        id: 'add-faq',
        title: 'Add a New FAQ Entry',
        icon: HelpCircle,
        description: 'Create and manage FAQs shown to employees in the support widget.',
        embed: 'https://scribehow.com/embed/How_to_Add_a_New_FAQ_Entry__m0oJPbgwQ1Sg8AynQ0M_Xg?as=video',
        aspect: '16/12',
      },
    ],
  },

  SUPERVISOR: {
    label: 'Supervisor',
    color: '#111827',
    lightBg: '#F3F4F6',
    videos: [
      {
        id: 'submit-evaluation',
        title: 'Submit  Evaluation',
        icon: Users,
        description: 'Learn how to submit a supervisor evaluation for an employee.',
        embed: 'https://scribehow.com/embed/How_to_Submit_a_Performance_Evaluation_as_Supervisor__vJMK-XEwTU69ViAa6O6Ksw?as=video',
        aspect: '16/12',
      },
      
    ],
  },

  EMPLOYEE: {
    label: 'Employee',
    color: '#4B5563',
    lightBg: '#F3F4F6',
    videos: [
      {
        id: 'complete-assessment',
        title: 'Complete a Pending Assessment',
        icon: Monitor,
        description: 'Step-by-step guide to starting and submitting your assessment.',
        embed: 'https://scribehow.com/embed/How_to_Complete_Pending_Assessment__qpBy2MG1TBOiTdashfw3Pw?as=video',
        aspect: '16/12',
      },
      {
        id: 'submit-feedback',
        title: 'Submit Feedback for Your Assessments',
        icon: MessageSquare,
        description: 'Share your experience and star rating for completed assessments.',
        embed: 'https://scribehow.com/embed/How_to_Submit_Feedback_for_Your_Assessments__-YiQGGM0RpeL7y1pSZ7G9Q?as=video',
        aspect: '1/1',
      },
      {
        id: 'faq-chat',
        title: 'Access FAQ & Chat with Admins',
        icon: HelpCircle,
        description: 'Use the support widget to browse FAQs or message HR admins directly.',
        embed: 'https://scribehow.com/embed/How_to_Access_FAQ_and_chat_with_admins_in_the_ZB_CAS_Portal__ra4duhzYSiO-C5luRtHP1g?as=video',
        aspect: '1/1',
      },
    ],
  },
};

export default function UserManual() {
  const { activeRole } = useAuth();
  const role = activeRole || 'EMPLOYEE';
  const guide = ROLE_GUIDES[role] || ROLE_GUIDES.EMPLOYEE;

  const [activeId, setActiveId] = useState(guide.videos[0].id);

  const activeVideo = guide.videos.find(v => v.id === activeId) || guide.videos[0];

  return (
    <div className="h-[calc(100vh-4rem)] flex overflow-hidden bg-gray-50">

      {/* ── Left: video list ─────────────────────────────────────────────── */}
      <aside className="w-72 flex-shrink-0 bg-white border-r border-gray-100 flex flex-col overflow-hidden">
        {/* Header */}
        <div
          className="px-5 py-4 flex-shrink-0"
          style={{ background: guide.lightBg, borderBottom: `1px solid ${guide.color}20` }}
        >
          <div className="flex items-center gap-2 mb-1">
            <BookMarked className="w-4 h-4" style={{ color: guide.color }} />
            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: guide.color }}>
              {guide.label} Guide
            </span>
          </div>
          <p className="text-xs text-gray-500">
            {guide.videos.length} video tutorial{guide.videos.length !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Video list */}
        <nav className="flex-1 overflow-y-auto py-2">
          {guide.videos.map((video, idx) => {
            const Icon = video.icon;
            const isActive = video.id === activeId;
            return (
              <button
                key={video.id}
                onClick={() => setActiveId(video.id)}
                className={`w-full flex items-start gap-3 px-4 py-3.5 text-left transition-all border-l-2 ${
                  isActive
                    ? 'border-l-2 bg-gray-50'
                    : 'border-transparent hover:bg-gray-50'
                }`}
                style={isActive ? { borderLeftColor: guide.color } : {}}
              >
                {/* Number + icon */}
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{
                    background: isActive ? guide.color : '#f3f4f6',
                    color: isActive ? 'white' : '#9ca3af',
                  }}
                >
                  {isActive
                    ? <Play className="w-3.5 h-3.5" />
                    : <span className="text-[11px] font-bold">{idx + 1}</span>
                  }
                </div>

                {/* Text */}
                <div className="flex-1 min-w-0">
                  <p
                    className={`text-sm font-semibold leading-tight ${
                      isActive ? 'text-gray-900' : 'text-gray-600'
                    }`}
                  >
                    {video.title}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5 line-clamp-2 leading-relaxed">
                    {video.description}
                  </p>
                </div>

                {isActive && (
                  <ChevronRight className="w-3.5 h-3.5 flex-shrink-0 mt-1" style={{ color: guide.color }} />
                )}
              </button>
            );
          })}
        </nav>
      </aside>

      {/* ── Right: active video ───────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto">
        <div className="p-6 lg:p-8 max-w-4xl mx-auto">

          {/* Title */}
          <div className="flex items-center gap-3 mb-5">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: guide.lightBg }}
            >
              {(() => { const Icon = activeVideo.icon; return <Icon className="w-5 h-5" style={{ color: guide.color }} />; })()}
            </div>
            <div>
              <h1 className="text-lg  font-bold text-brand-black leading-tight">{activeVideo.title}</h1>
            </div>
          </div>

          {/* Video embed */}
          <div className="rounded-2xl overflow-hidden border border-gray-200 shadow-sm bg-white">
            <iframe
              src={activeVideo.embed}
              width="100%"
              height="800"
              allow="fullscreen"
              style={{
                aspectRatio: activeVideo.aspect,
                border: 0,
                minHeight: 480,
                display: 'block',
              }}
              title={activeVideo.title}
            />
          </div>

          {/* Next video CTA */}
          {guide.videos.findIndex(v => v.id === activeId) < guide.videos.length - 1 && (() => {
            const nextIdx = guide.videos.findIndex(v => v.id === activeId) + 1;
            const next = guide.videos[nextIdx];
            const NextIcon = next.icon;
            return (
              <button
                onClick={() => setActiveId(next.id)}
                className="mt-4 w-full flex items-center gap-3 px-5 py-3.5 rounded-xl border border-gray-200 bg-white hover:shadow-sm transition-all group"
              >
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: guide.lightBg }}
                >
                  <NextIcon className="w-4 h-4" style={{ color: guide.color }} />
                </div>
                <div className="flex-1 text-left">
                  <p className="text-xs text-gray-400">Up next</p>
                  <p className="text-sm font-semibold text-gray-700 group-hover:text-gray-900">{next.title}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400 group-hover:translate-x-0.5 transition-transform" />
              </button>
            );
          })()}
        </div>
      </main>
    </div>
  );
}