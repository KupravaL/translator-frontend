import { Outlet, Link } from 'react-router-dom'
import { FileText, Layers, Menu, X, Settings } from 'lucide-react'
import { useState } from 'react'
import { 
  SignedIn, 
  SignedOut, 
  UserButton, 
  useUser 
} from '@clerk/clerk-react'

// DocTranslator Logo
const DocTranslatorLogo = () => (
  <div className="app-logo">
    <div className="logo-icon">
      <div className="absolute top-0 right-0 w-3 h-3 bg-indigo-800 transform rotate-45 translate-x-1.5 -translate-y-1.5"></div>
      <div className="h-1 w-5 bg-white absolute top-4 left-2.5 rounded-sm opacity-80"></div>
      <div className="h-1 w-4 bg-white absolute top-6 left-2.5 rounded-sm opacity-80"></div>
      <div className="h-1 w-5 bg-white absolute top-8 left-2.5 rounded-sm opacity-80"></div>
    </div>
    <div>
      <span className="logo-text">
        <span className="logo-text-dark">Doc</span>
        <span className="logo-text-brand">Translator</span>
      </span>
    </div>
  </div>
);

export default function Layout() {
  const { user, isLoaded } = useUser()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  
  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <Link to="/" className="flex items-center">
                <DocTranslatorLogo />
              </Link>
            </div>
            
            {/* Mobile menu button */}
            <div className="flex sm:hidden">
              <button 
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 focus:outline-none"
              >
                {mobileMenuOpen ? (
                  <X className="h-6 w-6" />
                ) : (
                  <Menu className="h-6 w-6" />
                )}
              </button>
            </div>
            
            {/* Desktop menu */}
            <div className="hidden sm:flex items-center space-x-4">
              <SignedIn>
                <div className="flex items-center space-x-4">
                  <Link 
                    to="/documents" 
                    className="px-3 py-2 rounded-md text-sm font-medium text-gray-600 hover:bg-gray-100"
                  >
                    <div className="flex items-center">
                      <FileText className="h-4 w-4 mr-1" />
                      Documents
                    </div>
                  </Link>
                  <Link 
                    to="/history" 
                    className="px-3 py-2 rounded-md text-sm font-medium text-gray-600 hover:bg-gray-100"
                  >
                    <div className="flex items-center">
                      <Layers className="h-4 w-4 mr-1" />
                      History
                    </div>
                  </Link>
                  <Link 
                    to="/settings" 
                    className="px-3 py-2 rounded-md text-sm font-medium text-gray-600 hover:bg-gray-100"
                  >
                    <div className="flex items-center">
                      <Settings className="h-4 w-4 mr-1" />
                      Settings
                    </div>
                  </Link>
                  <div className="h-6 w-px bg-gray-200 mx-2"></div>
                  <div className="flex items-center space-x-2">
                    {isLoaded && (
                      <span className="text-sm text-gray-700 font-medium">
                        {user?.firstName || user?.username}
                      </span>
                    )}
                    <UserButton 
                      afterSignOutUrl="/" 
                      appearance={{
                        elements: {
                          userButtonAvatarBox: "w-9 h-9 border-2 border-indigo-100"
                        }
                      }}
                    />
                  </div>
                </div>
              </SignedIn>
              
              <SignedOut>
                <div className="flex items-center space-x-2">
                  <Link 
                    to="/sign-in"
                    className="px-3 py-1.5 text-sm font-medium rounded-md text-gray-700 hover:bg-gray-100"
                  >
                    Sign In
                  </Link>
                  <Link 
                    to="/sign-up"
                    className="px-3 py-1.5 text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
                  >
                    Sign Up
                  </Link>
                </div>
              </SignedOut>
            </div>
          </div>
        </div>
        
        {/* Mobile menu */}
        <div className={`sm:hidden ${mobileMenuOpen ? 'block' : 'hidden'}`}>
          <div className="px-2 pt-2 pb-3 space-y-1 border-t">
            <SignedIn>
              <Link 
                to="/documents" 
                className="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:bg-gray-100"
                onClick={() => setMobileMenuOpen(false)}
              >
                <div className="flex items-center">
                  <FileText className="h-5 w-5 mr-2" />
                  Documents
                </div>
              </Link>
              <Link 
                to="/history" 
                className="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:bg-gray-100"
                onClick={() => setMobileMenuOpen(false)}
              >
                <div className="flex items-center">
                  <Layers className="h-5 w-5 mr-2" />
                  History
                </div>
              </Link>
              <div className="px-3 py-2 text-sm text-gray-500">
                Signed in as <span className="font-medium text-indigo-600">{user?.firstName || user?.username}</span>
              </div>
            </SignedIn>
            
            <SignedOut>
              <Link 
                to="/sign-in"
                className="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:bg-gray-100"
                onClick={() => setMobileMenuOpen(false)}
              >
                Sign In
              </Link>
              <Link 
                to="/sign-up"
                className="block px-3 py-2 rounded-md text-base font-medium text-indigo-600 hover:bg-gray-100"
                onClick={() => setMobileMenuOpen(false)}
              >
                Sign Up
              </Link>
            </SignedOut>
          </div>
        </div>
      </header>
      
      <main className="flex-1">
        <Outlet />
      </main>
      
      <footer className="bg-white border-t border-gray-200 py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="mb-4 md:mb-0">
              <DocTranslatorLogo />
            </div>
            <div className="flex flex-col sm:flex-row gap-4 sm:gap-8">
              <Link to="/about" className="text-sm text-gray-500 hover:text-indigo-600">About</Link>
              <Link to="/privacy" className="text-sm text-gray-500 hover:text-indigo-600">Privacy Policy</Link>
              <Link to="/terms" className="text-sm text-gray-500 hover:text-indigo-600">Terms of Service</Link>
              <Link to="/contact" className="text-sm text-gray-500 hover:text-indigo-600">Contact Us</Link>
            </div>
            <p className="mt-4 md:mt-0 text-sm text-gray-400">
              &copy; {new Date().getFullYear()} DocTranslator. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}