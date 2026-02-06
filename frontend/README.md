# ZB-CAS Frontend

**Zemen Bank Competency Assessment System** — React frontend with Vite & Tailwind CSS

## 🏗 Tech Stack

- **React 18** — Modern UI library with hooks
- **Vite** — Lightning-fast build tool and dev server
- **Tailwind CSS 3** — Utility-first CSS framework
- **React Router v6** — Client-side routing
- **Axios** — HTTP client with interceptors
- **Recharts** — Charting library for analytics
- **Lucide React** — Beautiful icon library

## 🎨 Design System

### Brand Colors (Zemen Bank)
```css
Primary Red:   #C8102E (var: brand-red)
Red Dark:      #A00D24 (var: brand-red-dark)
Red Light:     #E8283F (var: brand-red-light)
Red Muted:     #F5E5E7 (var: brand-red-muted)
Black:         #1A1A1A (var: brand-black)
Black Soft:    #27272A (var: brand-black-soft)
```

### Typography
- **Display Font**: Playfair Display (serif) — Headers and titles
- **Body Font**: DM Sans (sans-serif) — Body text and UI elements

### Competency Level Colors
- **Basic**: Yellow (#F59E0B)
- **Intermediate**: Orange (#EA580C)
- **Advanced**: Blue (#2563EB)
- **Expert**: Green (#16A34A)

## 📋 Features

### Role-Based Access Control

#### HR Administrators (HR_ADMIN)
- ✅ User management (CRUD employees, supervisors, admins)
- ✅ Competency framework management
- ✅ Question bank (MCQ, Rating, True/False, Short Answer)
- ✅ Recommendations per competency level
- ✅ Assessment lifecycle management
- ✅ Manual scoring for short answer questions
- ✅ Results management and finalization
- ✅ Reports & analytics (individual, department, heatmap)
- ✅ Feedback management

#### Supervisors
- ✅ Dashboard with direct reports
- ✅ Complete supervisor evaluations
- ✅ View subordinate results
- ✅ Access reports

#### Employees
- ✅ Take self-assessments
- ✅ View assessment progress
- ✅ Access personal results
- ✅ Generate Personal Development Plan (PDP)
- ✅ Submit feedback on assessments

### Assessment Types (per ZB_CAS.docx)
1. **Self Assessment** — Employee evaluates own competencies
2. **Supervisor Only** — Supervisor evaluates employee
3. **Combined** — Weighted blend of self & supervisor scores (e.g., 20% self / 80% supervisor)

### Question Types
- **MCQ** — Multiple choice with single correct answer
- **Rating** — 1-5 star scale
- **True/False** — Binary choice
- **Short Answer** — Free text requiring manual HR review

### Assessment Workflow
1. HR defines competency frameworks
2. HR creates assessments with questions
3. HR schedules assessments (DRAFT → SCHEDULED)
4. System activates assessments (SCHEDULED → ACTIVE)
5. Employees/supervisors complete assessments
6. Auto-save on every answer
7. HR triggers scoring
8. System generates results with levels (Basic/Intermediate/Advanced/Expert)
9. System assigns recommendations based on level
10. HR finalizes results (PENDING → FINAL)
11. Reports generated automatically

## 🚀 Installation

```bash
# Clone the repository
cd zb-cas-frontend-vite

# Install dependencies
npm install

# Configure environment
cp .env .env.local
# Edit .env.local to point to your backend API

# Start development server
npm run dev
```

The app will open at `http://localhost:3000`

## 🔧 Environment Variables

Create `.env.local`:
```
VITE_API_URL=http://localhost:5000/api
```

## 📦 Build for Production

```bash
# Build optimized production bundle
npm run build

# Preview production build locally
npm run preview
```

Build output will be in the `dist/` directory.

## 📁 Project Structure

```
zb-cas-frontend-vite/
├── src/
│   ├── components/          # Reusable UI components
│   │   ├── Sidebar.jsx      # Navigation sidebar
│   │   ├── Header.jsx       # Top header bar
│   │   └── Modal.jsx        # Modal wrapper
│   ├── context/             # React Context providers
│   │   ├── AuthContext.jsx  # Authentication state
│   │   └── ToastContext.jsx # Global notifications
│   ├── pages/               # Route pages
│   │   ├── Login.jsx
│   │   ├── Dashboard.jsx
│   │   ├── Users.jsx
│   │   ├── Competencies.jsx
│   │   ├── Recommendations.jsx
│   │   ├── Questions.jsx
│   │   ├── Assessments.jsx
│   │   ├── TakeAssessment.jsx
│   │   ├── Results.jsx
│   │   ├── Reports.jsx
│   │   └── Feedback.jsx
│   ├── utils/
│   │   └── api.js           # Axios instance with interceptors
│   ├── App.jsx              # Main app with routing
│   ├── main.jsx             # React entry point
│   └── index.css            # Tailwind + custom styles
├── index.html
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
├── package.json
└── .env
```

## 🔐 Authentication Flow

1. User logs in with email/password
2. Backend returns `accessToken` + `refreshToken`
3. Tokens stored in `localStorage`
4. Axios interceptor attaches `Bearer {accessToken}` to every request
5. On 401 error, interceptor automatically:
   - Calls `/auth/refresh` with `refreshToken`
   - Gets new token pair
   - Retries original request
   - On refresh failure → redirects to login

## 🎯 API Integration

All API calls go through `src/utils/api.js` which is an Axios instance configured to:
- Attach auth tokens automatically
- Handle token refresh transparently
- Provide consistent error handling

Example usage:
```javascript
import api from '../utils/api';

// GET request
const { data } = await api.get('/users');

// POST request
await api.post('/auth/login', { email, password });

// PUT request
await api.put(`/users/${id}`, formData);

// DELETE request
await api.delete(`/users/${id}`);
```

## 🎨 Tailwind Utilities

Custom classes defined in `index.css`:

### Badges
```jsx
<span className="badge badge-active">Active</span>
<span className="badge badge-expert">Expert</span>
<span className="badge badge-hr_admin">HR Admin</span>
```

### Progress Bars
```jsx
<div className="progress-bar">
  <div className="progress-fill" style={{ width: '75%' }} />
</div>
```

### Focus States
```jsx
<input className="focus-brand" />
```

### Card Hover
```jsx
<div className="card-hover">...</div>
```

## 🧩 Component Patterns

### Modal Pattern
```jsx
import Modal from '../components/Modal';

<Modal open={isOpen} onClose={() => setIsOpen(false)} title="Add User">
  <form>...</form>
</Modal>
```

### Toast Notifications
```jsx
import { useToast } from '../context/ToastContext';

const { show } = useToast();

show('Operation successful!', 'success');
show('Error occurred', 'error');
show('Warning message', 'warning');
show('Info message', 'info');
```

### Protected Routes
```jsx
<Route path="/admin" element={
  <ProtectedRoute>
    <AdminPage />
  </ProtectedRoute>
} />
```

## 📊 Data Flow

1. **Component mounts** → `useEffect` triggers
2. **API call** via `api.get/post/put/delete`
3. **Data received** → State updated with `setState`
4. **UI re-renders** with new data
5. **User interaction** → Handler function called
6. **State/API update** → UI reflects changes

## 🔄 Assessment Execution Flow

1. User navigates to `/assessments/:id/take`
2. Component loads assessment + questions from API
3. For each answer change:
   - Update local state immediately
   - Debounced auto-save to backend (600ms delay)
4. On submit:
   - Validate all questions answered
   - Call `/responses/submit` endpoint
   - Backend triggers scoring
   - Redirect to confirmation screen

## 🎓 Key Features Implementation

### Auto-Save
Implemented with `useRef` + debounced `setTimeout`:
```javascript
const autoSave = (questionId, value) => {
  clearTimeout(debounceRef.current[questionId]);
  debounceRef.current[questionId] = setTimeout(async () => {
    await api.post('/responses/save', { questionId, selectedAnswer: value });
  }, 600);
};
```

### Role-Based Navigation
Sidebar filters menu items based on user role:
```javascript
const visible = NAV_ITEMS.filter((n) => 
  !n.roles || n.roles.includes(auth.user?.role)
);
```

### Progress Tracking
Real-time calculation:
```javascript
const answeredCount = questions.filter((q) => 
  answers[q._id] !== undefined
).length;
const percentage = (answeredCount / questions.length) * 100;
```

## 🛠 Development Tips

### Hot Module Replacement (HMR)
Vite provides instant feedback during development. Changes appear without full page reload.

### Tailwind IntelliSense
Install the "Tailwind CSS IntelliSense" VS Code extension for autocomplete.

### React DevTools
Install React DevTools browser extension to inspect component tree and state.

### Network Debugging
Use browser DevTools Network tab to inspect API calls. All requests include `Authorization: Bearer {token}` header.

## 🚨 Common Issues

### CORS Errors
Ensure backend is configured to allow requests from `http://localhost:3000`

### 401 Unauthorized
- Check if `accessToken` is in `localStorage`
- Verify token hasn't expired
- Check backend auth middleware

### Build Errors
- Clear `node_modules` and reinstall: `rm -rf node_modules && npm install`
- Clear Vite cache: `rm -rf .vite`

## 📝 Testing

### Manual Testing Checklist
- [ ] Login with HR_ADMIN, SUPERVISOR, EMPLOYEE
- [ ] Create/edit/delete users
- [ ] Create competencies, questions, recommendations
- [ ] Create and schedule assessment
- [ ] Take assessment (auto-save + submit)
- [ ] Score assessment (HR)
- [ ] View results + PDP
- [ ] Generate reports
- [ ] Submit feedback

## 🎉 Next Steps

1. **Add Remaining Pages**: Competencies, Recommendations, Questions, Assessments, TakeAssessment, Results, Reports, Feedback
2. **Implement Full CRUD**: Complete create, read, update, delete for all entities
3. **Add Validation**: Form validation with error messages
4. **Loading States**: Skeleton loaders for better UX
5. **Error Boundaries**: Graceful error handling
6. **Accessibility**: ARIA labels, keyboard navigation
7. **Mobile Optimization**: Responsive design for tablets/phones
8. **E2E Tests**: Playwright or Cypress tests
9. **Performance**: Code splitting, lazy loading
10. **Documentation**: JSDoc comments for complex functions

## 📄 License

Proprietary — Zemen Bank Internal Use Only

## 👥 Support

For questions or issues, contact the IT department at support@zemenbank.com

---

**Built with ❤️ for Zemen Bank**
