import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Scale, BookOpen, Shield, Zap, Search, FileText, Image as ImageIcon } from 'lucide-react';
import NeuralCanvas from '../components/NeuralCanvas';

const Home = () => {
  const features = [
    {
      icon: <Search className="h-8 w-8 text-amber-400" />,
      title: "RAG 2.0 Engine",
      description: "Advanced Retrieval-Augmented Generation ensuring accurate answers derived directly from your custom legal documents & acts."
    },
    {
      icon: <ImageIcon className="h-8 w-8 text-cyan-400" />,
      title: "Scanned & Image OCR",
      description: "Extract text seamlessly from PDF scans, images (.png, .jpg, .webp), and contracts using embedded RapidOCR."
    },
    {
      icon: <Shield className="h-8 w-8 text-emerald-400" />,
      title: "Zero Hallucinations",
      description: "Strict context boundaries citation system providing line-item source references for every response."
    },
    {
      icon: <Zap className="h-8 w-8 text-yellow-400" />,
      title: "Instant Legal Insights",
      description: "Optimized Qwen reasoning pipeline delivering answers in seconds with full privacy."
    }
  ];

  const legalDocs = [
    "Indian Penal Code (IPC)",
    "Bharatiya Nyaya Sanhita (BNS)",
    "Constitution of India",
    "High Court & SC Judgments",
    "Corporate Contracts & NDAs",
    "Scanned Agreements & Receipts"
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 relative overflow-hidden pt-16">
      {/* Background Neural Canvas */}
      <NeuralCanvas isDocumentActive={false} nodeCount={60} />

      {/* Hero Section */}
      <section className="relative z-10 py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto text-center">
          <div className="inline-flex items-center space-x-2 px-4 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-semibold mb-6 backdrop-blur-md">
            <Scale className="w-4 h-4 text-amber-400" />
            <span>AI Powered Indian Legal Advisor & Intelligence Engine</span>
          </div>

          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-bold bg-gradient-to-r from-amber-200 via-amber-400 to-yellow-500 bg-clip-text text-transparent font-serif tracking-tight leading-tight mb-6">
            Intelligent Legal RAG <br />
            <span className="text-slate-100 font-sans text-3xl sm:text-5xl">For Docs, PDFs & Scanned Images</span>
          </h1>

          <p className="text-slate-400 text-lg sm:text-xl max-w-3xl mx-auto mb-10 leading-relaxed">
            Upload multi-format legal documents, contracts, and scanned images. Get instant, accurate legal guidance backed by exact source citations.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link 
              to="/chat" 
              className="px-8 py-4 rounded-xl bg-gradient-to-r from-amber-400 to-yellow-500 text-slate-950 font-bold text-base hover:from-amber-300 hover:to-yellow-400 shadow-xl shadow-amber-500/20 transition-all duration-200 inline-flex items-center justify-center space-x-2 group"
            >
              <span>Ask Legal AI Now</span>
              <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link 
              to="/about" 
              className="px-8 py-4 rounded-xl bg-slate-900/80 border border-slate-800 text-slate-200 font-semibold text-base hover:bg-slate-800 backdrop-blur-md transition-all inline-flex items-center justify-center space-x-2"
            >
              <BookOpen className="h-5 w-5 text-amber-400" />
              <span>How RAG Works</span>
            </Link>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="relative z-10 py-20 bg-slate-900/60 border-y border-slate-800/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-amber-200 to-yellow-400 bg-clip-text text-transparent font-serif mb-4">
              Designed For Supreme Precision
            </h2>
            <p className="text-slate-400 text-base max-w-2xl mx-auto">
              Custom-built vector search architecture tailored for Indian statutes, legal terms, and document structures.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feat, idx) => (
              <div 
                key={idx}
                className="bg-slate-950/70 border border-slate-800/80 p-6 rounded-2xl hover:border-amber-500/40 transition-all duration-300 shadow-xl"
              >
                <div className="mb-4">{feat.icon}</div>
                <h3 className="text-lg font-bold text-slate-100 mb-2 font-serif">{feat.title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{feat.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Supported Documents & Flow */}
      <section className="relative z-10 py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div>
            <h2 className="text-3xl sm:text-4xl font-bold text-amber-300 font-serif mb-6">
              Supported Legal Documents & Scans
            </h2>
            <p className="text-slate-400 text-base mb-8 leading-relaxed">
              Our embedded OCR pipeline automatically extracts text from low-quality scans, typed PDFs, DOCX contracts, and legal images.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
              {legalDocs.map((doc, idx) => (
                <div key={idx} className="flex items-center space-x-2.5 bg-slate-900/60 border border-slate-800 p-3 rounded-xl">
                  <div className="w-2 h-2 rounded-full bg-amber-400"></div>
                  <span className="text-sm font-medium text-slate-200">{doc}</span>
                </div>
              ))}
            </div>
            <Link 
              to="/chat" 
              className="px-6 py-3 rounded-xl bg-amber-400 text-slate-950 font-bold hover:bg-amber-300 transition-colors inline-flex items-center space-x-2"
            >
              <span>Upload Your Files</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 p-8 rounded-3xl backdrop-blur-xl shadow-2xl space-y-6">
            <div className="flex items-start space-x-4">
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-400">
                <FileText className="h-6 w-6" />
              </div>
              <div>
                <h4 className="font-bold text-slate-100 mb-1">1. Multi-File Upload</h4>
                <p className="text-slate-400 text-xs leading-relaxed">Upload multiple images or documents simultaneously into the neural index.</p>
              </div>
            </div>

            <div className="flex items-start space-x-4">
              <div className="p-3 bg-cyan-500/10 border border-cyan-500/30 rounded-xl text-cyan-400">
                <Search className="h-6 w-6" />
              </div>
              <div>
                <h4 className="font-bold text-slate-100 mb-1">2. Automatic OCR & Chunking</h4>
                <p className="text-slate-400 text-xs leading-relaxed">Scanned pages are converted to text and indexed into FAISS vector embeddings.</p>
              </div>
            </div>

            <div className="flex items-start space-x-4">
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400">
                <Shield className="h-6 w-6" />
              </div>
              <div>
                <h4 className="font-bold text-slate-100 mb-1">3. Citation-Backed Answers</h4>
                <p className="text-slate-400 text-xs leading-relaxed">Receive precise answers with document name and section references.</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Home;
