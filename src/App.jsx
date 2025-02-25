import { Routes, Route, Navigate } from 'react-router-dom'
import { 
  SignedIn, 
  SignedOut, 
  SignIn, 
  SignUp, 
  ClerkLoaded, 
  ClerkLoading, 
  RedirectToSignIn 
} from '@clerk/clerk-react'
import Layout from './components/Layout'
import DocumentTranslationPage from './components/DocumentTranslation'
import AccountSettings from './components/AccountSettingsPage'

function App() {
  return (
    <>
      <ClerkLoading>
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
        </div>
      </ClerkLoading>
      
      <ClerkLoaded>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={
              <>
                <SignedIn>
                  <DocumentTranslationPage />
                </SignedIn>
                <SignedOut>
                  <RedirectToSignIn />
                </SignedOut>
              </>
            } />
            
            {/* Account Settings Route */}
            <Route path="/settings" element={
              <>
                <SignedIn>
                  <AccountSettings />
                </SignedIn>
                <SignedOut>
                  <RedirectToSignIn />
                </SignedOut>
              </>
            } />
            
            <Route path="/sign-in/*" element={
              <SignedOut>
                <div className="flex items-center justify-center min-h-[calc(100vh-8rem)] bg-gray-50">
                  <div className="w-full max-w-md">
                    <SignIn routing="path" path="/sign-in" />
                  </div>
                </div>
              </SignedOut>
            } />
            
            <Route path="/sign-up/*" element={
              <SignedOut>
                <div className="flex items-center justify-center min-h-[calc(100vh-8rem)] bg-gray-50">
                  <div className="w-full max-w-md">
                    <SignUp routing="path" path="/sign-up" />
                  </div>
                </div>
              </SignedOut>
            } />
          </Route>
        </Routes>
      </ClerkLoaded>
    </>
  )
}

export default App