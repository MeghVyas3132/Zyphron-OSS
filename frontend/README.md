# Zyphron Frontend

Modern cloud deployment platform frontend built with Next.js 14, TypeScript, and Tailwind CSS.

## Features

- Launch **Next.js 14** with App Router
- Notes **TypeScript** for type safety
- Design **Tailwind CSS** for styling
- Theme **Dark Mode** support with next-themes
- Data **React Query** for server state management
- Auth **Authentication** with JWT
- Responsive **Responsive** design

## Getting Started

### Prerequisites

- Node.js 18+
- npm or pnpm

### Installation

1. Install dependencies:
```bash
npm install
```

2. Copy environment variables:
```bash
cp .env.example .env.local
```

3. Configure your environment variables in `.env.local`:
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_GITHUB_CLIENT_ID=your_github_client_id
```

4. Start the development server:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── (auth)/            # Authentication pages (login, register)
│   ├── (dashboard)/       # Protected dashboard pages
│   │   ├── dashboard/     # Main dashboard
│   │   ├── projects/      # Projects management
│   │   ├── databases/     # Database management
│   │   └── settings/      # User settings
│   ├── layout.tsx         # Root layout
│   └── page.tsx           # Landing page
├── components/            # React components
│   ├── ui/               # UI primitives (Button, Input, etc.)
│   └── providers/        # Context providers
├── hooks/                # Custom React hooks
│   ├── use-auth.ts       # Authentication hooks
│   ├── use-projects.ts   # Project data hooks
│   └── use-deployments.ts # Deployment hooks
├── lib/                  # Utilities
│   ├── api.ts           # API client
│   └── utils.ts         # Helper functions
└── styles/              # Global styles
    └── globals.css      # Tailwind CSS imports
```

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

## Pages

### Public Pages
- `/` - Landing page with features and pricing
- `/login` - User login
- `/register` - User registration

### Dashboard Pages (Protected)
- `/dashboard` - Overview with stats and recent activity
- `/projects` - List all projects
- `/projects/new` - Create new project
- `/projects/[slug]` - Project details and deployments
- `/databases` - Database management
- `/settings` - User settings

## API Integration

The frontend connects to the Zyphron Backend API. Make sure the backend is running on `http://localhost:8000` or update `NEXT_PUBLIC_API_URL` accordingly.

## Tech Stack

- **Framework**: Next.js 14
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **Forms**: React Hook Form + Zod
- **Data Fetching**: TanStack Query (React Query)
- **Notifications**: Sonner
- **Theme**: next-themes

## License

MIT License
