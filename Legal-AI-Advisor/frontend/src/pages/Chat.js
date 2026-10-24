import React, { useState, useEffect, useRef } from 'react';
import { Send, Upload, X, FileText, Loader2, AlertCircle, Trash2, Image as ImageIcon, Sparkles, CheckCircle2, ShieldCheck, Scale, FileSpreadsheet, Download, ShieldAlert, Activity, Zap, RefreshCw, Cpu } from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import toast from 'react-hot-toast';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import NeuralCanvas from '../components/NeuralCanvas';

const Chat = () => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [activeTab, setActiveTab] = useState('chat'); // 'chat' | 'risk_audit'
  const [apiStats, setApiStats] = useState(null);
  const [isStatsLoading, setIsStatsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const fetchApiStats = async () => {
    setIsStatsLoading(true);
    try {
      const res = await axios.get('/api/stats');
      if (res.data?.success && res.data?.data) {
        setApiStats(res.data.data);
      }
    } catch (err) {
      console.warn('Failed to fetch API stats', err);
    } finally {
      setIsStatsLoading(false);
    }
  };

  // Fetch initial documents list & API telemetry on mount
  useEffect(() => {
    const fetchExistingDocs = async () => {
      try {
        const res = await axios.get('/documents');
        if (res.data?.success && res.data?.data?.uploaded_files) {
          setUploadedFiles(res.data.data.uploaded_files.map(f => ({
            name: f.name,
            size: f.size,
            uploadTime: new Date(f.modified * 1000).toLocaleTimeString()
          })));
        }
      } catch (err) {
        console.warn('Failed to fetch existing documents', err);
      }
    };
    fetchExistingDocs();
    fetchApiStats();

    const interval = setInterval(fetchApiStats, 8000);
    return () => clearInterval(interval);
  }, []);

  const onDrop = async (acceptedFiles) => {
    if (!acceptedFiles || acceptedFiles.length === 0) return;
    await uploadFilesBatch(acceptedFiles);
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'text/plain': ['.txt'],
      'image/png': ['.png'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/webp': ['.webp'],
      'image/bmp': ['.bmp'],
      'image/tiff': ['.tiff']
    },
    maxSize: 50 * 1024 * 1024,
  });

  const uploadFilesBatch = async (files) => {
    setIsUploading(true);
    const toastId = toast.loading(`Processing ${files.length} file(s) with Multilingual Vision OCR & Vector Search...`);
    const formData = new FormData();
    files.forEach(file => {
      formData.append('files', file);
    });

    try {
      const response = await axios.post('/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      toast.dismiss(toastId);

      if (response.data?.success) {
        const processed = response.data.data.processed_files || [];
        const newFiles = processed.map(f => ({
          name: f.filename,
          size: f.file_size,
          type: f.file_type,
          uploadTime: new Date().toLocaleTimeString()
        }));

        setUploadedFiles(prev => [...prev, ...newFiles]);
        toast.success(`Successfully indexed ${processed.length} file(s) with Vision OCR & Vector Search!`);

        if (response.data.data.failed_files?.length > 0) {
          toast.error(`${response.data.data.failed_files.length} file(s) could not be processed.`);
        }
      } else {
        toast.error(response.data?.error || 'Upload failed');
      }
    } catch (error) {
      toast.dismiss(toastId);
      console.error('Upload error:', error);
      toast.error(error.response?.data?.error || 'Failed to upload files');
    } finally {
      setIsUploading(false);
      fetchApiStats();
    }
  };

  const executeLegalQuery = async (queryText) => {
    if (!queryText.trim() || isLoading) return;

    const userMessage = {
      id: Date.now(),
      type: 'user',
      content: queryText,
      timestamp: new Date().toLocaleTimeString()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await axios.post('/ask', {
        question: queryText
      });

      if (response.data?.success) {
        const assistantMessage = {
          id: Date.now() + 1,
          type: 'assistant',
          content: response.data.data.answer,
          sources: response.data.data.sources || [],
          timestamp: new Date().toLocaleTimeString()
        };
        setMessages(prev => [...prev, assistantMessage]);
      } else {
        throw new Error(response.data?.error || 'Failed to query RAG assistant');
      }
    } catch (error) {
      console.error('Chat error:', error);
      const messageText = error.response?.data?.error || error.message ||
        'Failed to process query. Please try again.';
      const assistantError = {
        id: Date.now() + 1,
        type: 'assistant',
        content: messageText,
        error: true,
        timestamp: new Date().toLocaleTimeString()
      };
      setMessages(prev => [...prev, assistantError]);
      toast.error(messageText);
    } finally {
      setIsLoading(false);
      fetchApiStats();
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    executeLegalQuery(input);
  };

  const runRiskAudit = () => {
    if (uploadedFiles.length === 0) {
      toast.error('Please upload at least one document or image contract to run a Risk Audit.');
      return;
    }
    executeLegalQuery("Perform an executive Legal Risk Audit on all uploaded documents. Identify: 1) High Risk Clauses & Liabilities, 2) Key Obligations, 3) Governing Jurisdiction & Termination Terms.");
  };

  const exportLegalBrief = () => {
    if (messages.length === 0) {
      toast.error('No conversation history to export.');
      return;
    }

    let briefText = `# ⚖️ LEGAL AI ADVISOR - CASE BRIEF REPORT\nGenerated: ${new Date().toLocaleString()}\n\n---\n\n`;
    messages.forEach(m => {
      if (m.type === 'user') {
        briefText += `### ❓ QUESTION:\n${m.content}\n\n`;
      } else {
        briefText += `### 📜 LEGAL ANALYSIS:\n${m.content}\n\n`;
        if (m.sources && m.sources.length > 0) {
          briefText += `**DOCUMENT SOURCES & CITATIONS:**\n`;
          m.sources.forEach((s, idx) => {
            briefText += `- Source ${idx + 1}: ${s.metadata?.filename || 'Doc'} (Page ${s.metadata?.page || 1})\n  Snippet: "${s.content}"\n`;
          });
          briefText += `\n`;
        }
      }
      briefText += `---\n\n`;
    });

    const blob = new Blob([briefText], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Legal_Brief_${Date.now()}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast.success('Legal Brief downloaded successfully!');
  };

  const clearChat = () => {
    setMessages([]);
    toast.success('Chat history cleared');
  };

  const resetAllDocuments = async () => {
    try {
      await axios.delete('/documents/reset');
      setUploadedFiles([]);
      fetchApiStats();
      toast.success('All documents & vector store reset');
    } catch (err) {
      toast.error('Failed to reset documents');
    }
  };

  const getFileBadge = (filename) => {
    const ext = filename.split('.').pop().toLowerCase();
    if (['png', 'jpg', 'jpeg', 'webp', 'bmp', 'tiff'].includes(ext)) {
      return (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30">
          <ImageIcon className="w-3 h-3 mr-1" /> OCR IMAGE
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
        <FileText className="w-3 h-3 mr-1" /> {ext.toUpperCase()}
      </span>
    );
  };

  const formatFileSize = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const statutoryPresets = [
    { label: "📜 Kararpatra / Agreement Audit", query: "Analyze the uploaded contract/करारपत्र: Who are the executing parties, addresses, registration/stamp details, attached ID proofs, and key terms?" },
    { label: "IPC 302 / BNS 103", query: "What is Section 302 of Indian Penal Code and its corresponding BNS section?" },
    { label: "Bail Grounds (CrPC)", query: "What are the essential grounds for bail under Indian Criminal Procedure Code?" },
    { label: "Contract Breach Sec 73", query: "Explain Section 73 of Indian Contract Act regarding damages for breach." },
    { label: "Constitutional Art 21", query: "Explain fundamental rights under Article 21 of Indian Constitution." }
  ];

  return (
    <div className="min-h-screen pt-20 pb-10 px-4 sm:px-6 lg:px-8 bg-slate-950 text-slate-100 relative overflow-hidden">
      {/* Dynamic Interconnected Neural Background Canvas */}
      <NeuralCanvas isDocumentActive={uploadedFiles.length > 0} nodeCount={50} />

      <div className="max-w-7xl mx-auto relative z-10">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-semibold mb-3 backdrop-blur-md">
            <Scale className="w-4 h-4 text-amber-400" />
            <span>Enterprise Multimodal Legal Intelligence Workspace</span>
          </div>
          <h1 className="text-3xl md:text-5xl font-bold bg-gradient-to-r from-amber-200 via-amber-400 to-yellow-500 bg-clip-text text-transparent font-serif tracking-tight">
            Indian Legal AI Advisor
          </h1>
          <p className="mt-2 text-slate-400 text-sm max-w-2xl mx-auto">
            Zero-hallucination statutory research, OCR contract auditing, and citation-backed legal analysis.
          </p>
        </div>

        {/* Quick Statutory Shortcuts & Action Toolbar */}
        <div className="mb-6 bg-slate-900/80 backdrop-blur-xl border border-slate-800 p-3 rounded-2xl flex flex-wrap items-center justify-between gap-3 shadow-xl">
          <div className="flex items-center space-x-2 overflow-x-auto py-1">
            <span className="text-xs font-semibold text-amber-400 flex items-center shrink-0">
              <Scale className="w-3.5 h-3.5 mr-1" /> Quick Law Acts:
            </span>
            {statutoryPresets.map((preset, i) => (
              <button
                key={i}
                onClick={() => executeLegalQuery(preset.query)}
                className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 hover:border-amber-500/40 text-[11px] text-slate-300 hover:text-amber-300 transition-all shrink-0"
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={runRiskAudit}
              className="px-3 py-1.5 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 text-xs font-semibold flex items-center transition-all shadow-sm"
            >
              <ShieldAlert className="w-3.5 h-3.5 mr-1 text-amber-400" /> Contract Risk Audit
            </button>
            <button
              onClick={exportLegalBrief}
              className="px-3 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30 text-xs font-semibold flex items-center transition-all shadow-sm"
            >
              <Download className="w-3.5 h-3.5 mr-1 text-emerald-400" /> Export Brief Report
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Left Sidebar */}
          <div className="lg:col-span-1 space-y-5">
            {/* Upload Box */}
            <div className="bg-slate-900/80 backdrop-blur-xl p-5 rounded-2xl border border-slate-800 shadow-2xl hover:border-amber-500/40 transition-all duration-300">
              <h3 className="font-semibold text-amber-300 mb-3 flex items-center text-sm tracking-wide">
                <Upload className="h-4 w-4 mr-2 text-amber-400" />
                Upload Contracts & Images
              </h3>
              
              <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all duration-200 ${
                  isDragActive 
                    ? 'border-amber-400 bg-amber-500/10 scale-[1.02]' 
                    : 'border-slate-700 hover:border-amber-500/50 bg-slate-950/50'
                }`}
              >
                <input {...getInputProps()} />
                <div className="w-10 h-10 mx-auto mb-2 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                  <Upload className="h-5 w-5" />
                </div>
                <p className="text-xs font-medium text-slate-200">
                  {isDragActive ? 'Drop files here...' : 'Drag & Drop files or images'}
                </p>
                <p className="text-[11px] text-slate-400 mt-1">
                  PDF, DOCX, TXT, PNG, JPG, WEBP (Max 50MB)
                </p>
              </div>

              {isUploading && (
                <div className="mt-3 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center space-x-2 text-xs text-amber-300">
                  <Loader2 className="h-4 w-4 animate-spin text-amber-400" />
                  <span>Multilingual Vision OCR & Vector Indexing...</span>
                </div>
              )}
            </div>

            {/* API Call Monitor & Minimizer Telemetry */}
            <div className="bg-slate-900/80 backdrop-blur-xl p-4 rounded-2xl border border-slate-800 shadow-2xl space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-slate-200 flex items-center text-xs tracking-wide uppercase">
                  <Activity className="h-3.5 w-3.5 mr-1.5 text-cyan-400 animate-pulse" />
                  API Calls & Token Saver
                </h3>
                <button
                  onClick={fetchApiStats}
                  disabled={isStatsLoading}
                  title="Refresh API Telemetry"
                  className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-cyan-300 transition-colors"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isStatsLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="bg-slate-950/70 border border-slate-800/80 p-2.5 rounded-xl">
                  <div className="flex items-center justify-center space-x-1 text-slate-400 text-[10px] mb-0.5">
                    <Cpu className="w-3 h-3 text-amber-400" />
                    <span>Vision API Calls</span>
                  </div>
                  <div className="text-lg font-bold text-amber-300 font-mono">
                    {apiStats ? apiStats.vision_calls : 0}
                  </div>
                  <div className="text-[9px] text-slate-500">Live API Requests</div>
                </div>

                <div className="bg-slate-950/70 border border-emerald-900/30 p-2.5 rounded-xl">
                  <div className="flex items-center justify-center space-x-1 text-emerald-400 text-[10px] mb-0.5">
                    <Zap className="w-3 h-3 text-emerald-400" />
                    <span>0-Cost Hits</span>
                  </div>
                  <div className="text-lg font-bold text-emerald-400 font-mono">
                    {apiStats ? (apiStats.cache_hits + apiStats.blank_skips) : 0}
                  </div>
                  <div className="text-[9px] text-emerald-500/80">Cached & Skipped</div>
                </div>
              </div>

              <div className="space-y-1.5 pt-1 text-[11px] text-slate-400 border-t border-slate-800/60">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Tokens Saved:</span>
                  <span className="font-mono text-emerald-400 font-semibold">
                    ~{(apiStats?.tokens_saved || 0).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Active Model:</span>
                  <span className="font-mono text-[10px] text-slate-300 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800 truncate max-w-[125px]">
                    {apiStats?.active_model || 'qwen/qwen3.8-27b'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Last Latency:</span>
                  <span className="font-mono text-slate-300">
                    {apiStats?.last_latency_s ? `${apiStats.last_latency_s}s` : '0.0s'}
                  </span>
                </div>
                {apiStats?.rate_limit_fallbacks > 0 && (
                  <div className="flex justify-between items-center text-amber-400/90">
                    <span>Instant Fallbacks:</span>
                    <span className="font-mono font-semibold">{apiStats.rate_limit_fallbacks}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Uploaded Documents Knowledge Inspector */}
            <div className="bg-slate-900/80 backdrop-blur-xl p-5 rounded-2xl border border-slate-800 shadow-2xl space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-slate-200 flex items-center text-sm">
                  <ShieldCheck className="h-4 w-4 mr-2 text-emerald-400" />
                  Indexed Repository ({uploadedFiles.length})
                </h3>
                {uploadedFiles.length > 0 && (
                  <button
                    onClick={resetAllDocuments}
                    title="Reset All Indexed Files"
                    className="text-slate-400 hover:text-red-400 text-xs flex items-center transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1" /> Reset Vector DB
                  </button>
                )}
              </div>

              {uploadedFiles.length === 0 ? (
                <div className="text-center py-6 border border-slate-800/80 rounded-xl bg-slate-950/40">
                  <FileText className="h-7 w-7 text-slate-600 mx-auto mb-2" />
                  <p className="text-xs text-slate-400">No documents uploaded yet.</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">Statutory legal queries work out-of-the-box!</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {uploadedFiles.map((file, idx) => (
                    <div 
                      key={idx} 
                      className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800/80 flex items-center justify-between group hover:border-amber-500/30 transition-all"
                    >
                      <div className="flex-1 min-w-0 pr-2">
                        <div className="flex items-center space-x-1.5 mb-1">
                          {getFileBadge(file.name)}
                          <p className="text-xs font-medium text-slate-200 truncate">
                            {file.name}
                          </p>
                        </div>
                        <p className="text-[10px] text-slate-400">
                          {formatFileSize(file.size)} • {file.uploadTime || 'Indexed'}
                        </p>
                      </div>
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Sidebar Actions */}
            <div className="space-y-2">
              <button
                onClick={clearChat}
                disabled={messages.length === 0}
                className="w-full py-2 px-3 rounded-xl border border-slate-800 bg-slate-900/60 hover:bg-slate-800 text-slate-300 text-xs font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Clear Conversation History
              </button>
            </div>
          </div>

          {/* Chat / Legal Analysis Workspace */}
          <div className="lg:col-span-3">
            <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-2xl shadow-2xl flex flex-col h-[650px] overflow-hidden">
              {/* Message History */}
              <div className="flex-1 p-5 overflow-y-auto space-y-4">
                {messages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-6">
                    <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mb-4 shadow-lg shadow-amber-500/10">
                      <Scale className="h-8 w-8" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-100 font-serif mb-1">
                      Legal AI Advisor Workspace
                    </h3>
                    <p className="text-sm text-slate-400 max-w-md mb-6">
                      Upload legal contracts, scanned deeds, or agreements. Get statutory answers, risk audits, and citation-backed legal briefs.
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg w-full">
                      {[
                        "What is Section 302 of Indian Penal Code?",
                        "Audit high-risk clauses in uploaded agreement",
                        "What are the ground rules for bail under CrPC?",
                        "Summarize key termination obligations in contract"
                      ].map((sample, idx) => (
                        <button
                          key={idx}
                          onClick={() => executeLegalQuery(sample)}
                          className="p-3 text-left rounded-xl bg-slate-950/60 border border-slate-800 hover:border-amber-500/40 text-xs text-slate-300 hover:text-amber-200 transition-all duration-200"
                        >
                          "{sample}"
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-2xl p-4 shadow-lg transition-all ${
                          message.type === 'user'
                            ? 'bg-gradient-to-r from-amber-500 to-yellow-600 text-slate-950 font-medium rounded-tr-none'
                            : message.error
                            ? 'bg-red-950/40 border border-red-500/40 text-red-200 rounded-tl-none'
                            : 'bg-slate-950/80 border border-slate-800 text-slate-100 rounded-tl-none'
                        }`}
                      >
                        {message.error && (
                          <div className="flex items-center text-red-400 mb-2 text-xs font-semibold">
                            <AlertCircle className="h-4 w-4 mr-1" />
                            <span>System Alert</span>
                          </div>
                        )}

                        <div className="prose prose-invert prose-amber max-w-none text-sm leading-relaxed">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {message.content}
                          </ReactMarkdown>
                        </div>

                        <div className="text-[10px] mt-2 opacity-60 text-right font-mono">
                          {message.timestamp}
                        </div>

                        {/* Verified Document Citation Display */}
                        {message.sources && message.sources.length > 0 && (
                          <div className="mt-4 pt-3 border-t border-slate-800 space-y-2">
                            <p className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider flex items-center">
                              <ShieldCheck className="w-3.5 h-3.5 mr-1" />
                              VERIFIED DOCUMENT SOURCES & CITATIONS ({message.sources.length}):
                            </p>
                            <div className="grid grid-cols-1 gap-2">
                              {message.sources.map((src, i) => (
                                <div 
                                  key={i} 
                                  className="p-2.5 rounded-lg bg-slate-900 border border-slate-800/80 text-xs text-slate-300"
                                >
                                  <div className="flex items-center justify-between font-semibold text-amber-300 mb-1 text-[11px]">
                                    <span>Source {i + 1}: {src.metadata?.filename || src.metadata?.source_file || 'Document'}</span>
                                    <span>Page {src.metadata?.page || 1}</span>
                                  </div>
                                  <p className="text-[11px] italic text-slate-400 line-clamp-2">
                                    "{src.content}"
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}

                {isLoading && (
                  <div className="flex justify-start">
                    <div className="bg-slate-950/80 border border-slate-800 rounded-2xl rounded-tl-none p-4 flex items-center space-x-3 shadow-lg">
                      <Loader2 className="w-5 h-5 animate-spin text-amber-400" />
                      <span className="text-xs text-amber-200 font-medium">Executing FAISS Similarity Search & Synthesizing Cited Legal Response...</span>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Chat Input Form */}
              <form onSubmit={handleSubmit} className="p-4 border-t border-slate-800 bg-slate-950/90 backdrop-blur-md">
                <div className="flex items-center space-x-3">
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Ask statutory questions or inquire about uploaded files..."
                    className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/60 transition-all"
                    disabled={isLoading}
                  />
                  <button
                    type="submit"
                    disabled={isLoading || !input.trim()}
                    className="p-3 rounded-xl bg-gradient-to-r from-amber-400 to-yellow-500 text-slate-950 font-bold hover:from-amber-300 hover:to-yellow-400 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-amber-500/20 transition-all duration-200 flex items-center justify-center shrink-0"
                  >
                    {isLoading ? (
                      <Loader2 className="h-5 w-5 animate-spin text-slate-950" />
                    ) : (
                      <Send className="h-5 w-5 stroke-[2.5]" />
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Chat;
