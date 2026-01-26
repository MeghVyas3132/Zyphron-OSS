'use client';

import { useState } from 'react';
import { Zap, Shield, Gauge, FileCode, GitBranch, RefreshCw, AlertTriangle, CheckCircle, Clock, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAIAnalysis, useDockerfileGeneration, AIAnalysisResult, SecurityIssue, PerformanceRecommendation } from '@/hooks/use-ai';

export default function AIInsightsPage() {
  const [repoUrl, setRepoUrl] = useState('');
  const { analysisResult, analyzeRepo, isAnalyzing, clearAnalysis } = useAIAnalysis();
  const { generateDockerfile, dockerfile, isGenerating } = useDockerfileGeneration();

  const handleAnalyze = () => {
    if (repoUrl.trim()) {
      analyzeRepo({ repoUrl: repoUrl.trim() });
    }
  };

  const handleGenerateDockerfile = () => {
    if (repoUrl.trim()) {
      generateDockerfile({ repoUrl: repoUrl.trim() });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Zap className="h-8 w-8 text-yellow-500" />
            AI Insights
          </h1>
          <p className="text-muted-foreground mt-1">
            Analyze repositories, detect frameworks, and get optimization recommendations
          </p>
        </div>
      </div>

      {/* Analyze Section */}
      <div className="bg-card rounded-lg border p-6">
        <h2 className="text-lg font-semibold mb-4">Analyze Repository</h2>
        <div className="flex gap-4">
          <Input
            placeholder="https://github.com/user/repo"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            className="flex-1"
          />
          <Button onClick={handleAnalyze} disabled={isAnalyzing || !repoUrl.trim()}>
            {isAnalyzing ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Zap className="mr-2 h-4 w-4" />
                Analyze
              </>
            )}
          </Button>
          <Button variant="outline" onClick={handleGenerateDockerfile} disabled={isGenerating || !repoUrl.trim()}>
            {isGenerating ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <FileCode className="mr-2 h-4 w-4" />
                Generate Dockerfile
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Analysis Results */}
      {analysisResult && (
        <div className="grid gap-6 md:grid-cols-2">
          {/* Framework Detection */}
          <div className="bg-card rounded-lg border p-6">
            <div className="flex items-center gap-2 mb-4">
              <Layers className="h-5 w-5 text-blue-500" />
              <h3 className="font-semibold">Framework Detection</h3>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Framework</span>
                <span className="font-medium">{analysisResult.framework.framework}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Language</span>
                <span className="font-medium">{analysisResult.framework.language}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Confidence</span>
                <div className="flex items-center gap-2">
                  <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-green-500" 
                      style={{ width: `${analysisResult.framework.confidence}%` }}
                    />
                  </div>
                  <span className="text-sm">{analysisResult.framework.confidence}%</span>
                </div>
              </div>
              {analysisResult.framework.version && (
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Version</span>
                  <span className="font-medium">{analysisResult.framework.version}</span>
                </div>
              )}
              {analysisResult.framework.packageManager && (
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Package Manager</span>
                  <span className="font-medium">{analysisResult.framework.packageManager}</span>
                </div>
              )}
            </div>
          </div>

          {/* Security Score */}
          <div className="bg-card rounded-lg border p-6">
            <div className="flex items-center gap-2 mb-4">
              <Shield className="h-5 w-5 text-green-500" />
              <h3 className="font-semibold">Security Analysis</h3>
            </div>
            <div className="flex items-center gap-4 mb-4">
              <div className="text-4xl font-bold">{analysisResult.security.score}</div>
              <div className="text-sm text-muted-foreground">/ 100</div>
              <div className={`px-2 py-1 rounded text-xs font-medium ${
                analysisResult.security.score >= 80 ? 'bg-green-500/20 text-green-500' :
                analysisResult.security.score >= 60 ? 'bg-yellow-500/20 text-yellow-500' :
                'bg-red-500/20 text-red-500'
              }`}>
                {analysisResult.security.score >= 80 ? 'Good' :
                 analysisResult.security.score >= 60 ? 'Fair' : 'Needs Improvement'}
              </div>
            </div>
            {analysisResult.security.issues.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">Issues Found</h4>
                {analysisResult.security.issues.slice(0, 3).map((issue: SecurityIssue, idx: number) => (
                  <div key={idx} className="flex items-start gap-2 text-sm">
                    <AlertTriangle className={`h-4 w-4 mt-0.5 flex-shrink-0 ${
                      issue.severity === 'critical' ? 'text-red-500' :
                      issue.severity === 'high' ? 'text-orange-500' :
                      issue.severity === 'medium' ? 'text-yellow-500' : 'text-blue-500'
                    }`} />
                    <span>{issue.message}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Performance Score */}
          <div className="bg-card rounded-lg border p-6">
            <div className="flex items-center gap-2 mb-4">
              <Gauge className="h-5 w-5 text-purple-500" />
              <h3 className="font-semibold">Performance Analysis</h3>
            </div>
            <div className="flex items-center gap-4 mb-4">
              <div className="text-4xl font-bold">{analysisResult.performance.score}</div>
              <div className="text-sm text-muted-foreground">/ 100</div>
            </div>
            {analysisResult.performance.recommendations.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">Recommendations</h4>
                {analysisResult.performance.recommendations.slice(0, 3).map((rec: PerformanceRecommendation, idx: number) => (
                  <div key={idx} className="flex items-start gap-2 text-sm">
                    <CheckCircle className="h-4 w-4 mt-0.5 text-green-500 flex-shrink-0" />
                    <div>
                      <span className="font-medium">{rec.title}</span>
                      <p className="text-muted-foreground text-xs">{rec.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Resource Recommendations */}
          <div className="bg-card rounded-lg border p-6">
            <div className="flex items-center gap-2 mb-4">
              <GitBranch className="h-5 w-5 text-orange-500" />
              <h3 className="font-semibold">Resource Recommendations</h3>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Tier</span>
                <span className="font-medium capitalize">{analysisResult.resourceRecommendations.tier}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">CPU</span>
                <span className="font-medium">{analysisResult.resourceRecommendations.cpu}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Memory</span>
                <span className="font-medium">{analysisResult.resourceRecommendations.memory}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Replicas</span>
                <span className="font-medium">{analysisResult.resourceRecommendations.replicas}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Est. Cost</span>
                <span className="font-medium">${analysisResult.resourceRecommendations.estimatedCost}/mo</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Dockerfile Preview */}
      {dockerfile && (
        <div className="bg-card rounded-lg border p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <FileCode className="h-5 w-5 text-blue-500" />
              <h3 className="font-semibold">Generated Dockerfile</h3>
            </div>
            <div className="flex gap-2">
              {dockerfile.stages.map((stage: string, idx: number) => (
                <span key={idx} className="px-2 py-1 bg-muted rounded text-xs">{stage}</span>
              ))}
            </div>
          </div>
          <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-sm font-mono">
            {dockerfile.dockerfile}
          </pre>
          {dockerfile.optimizations.length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm font-medium text-muted-foreground mb-2">Optimizations Applied</h4>
              <div className="flex flex-wrap gap-2">
                {dockerfile.optimizations.map((opt: string, idx: number) => (
                  <span key={idx} className="px-2 py-1 bg-green-500/20 text-green-500 rounded text-xs">
                    {opt}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Build Optimizations */}
      {analysisResult && (
        <div className="bg-card rounded-lg border p-6">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="h-5 w-5 text-cyan-500" />
            <h3 className="font-semibold">Build Optimizations</h3>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">Caching</h4>
              <div className="space-y-1">
                {analysisResult.buildOptimizations.caching.map((item: string, idx: number) => (
                  <div key={idx} className="text-sm flex items-center gap-2">
                    <CheckCircle className="h-3 w-3 text-green-500" />
                    {item}
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">Parallelization</h4>
              <div className="space-y-1">
                {analysisResult.buildOptimizations.parallelization.map((item: string, idx: number) => (
                  <div key={idx} className="text-sm flex items-center gap-2">
                    <CheckCircle className="h-3 w-3 text-green-500" />
                    {item}
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">Layer Optimization</h4>
              <div className="space-y-1">
                {analysisResult.buildOptimizations.layerOptimization.map((item: string, idx: number) => (
                  <div key={idx} className="text-sm flex items-center gap-2">
                    <CheckCircle className="h-3 w-3 text-green-500" />
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!analysisResult && !dockerfile && (
        <div className="bg-card rounded-lg border p-12 text-center">
          <Zap className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium mb-2">No Analysis Yet</h3>
          <p className="text-muted-foreground mb-4">
            Enter a GitHub repository URL above to analyze the project and get AI-powered recommendations.
          </p>
        </div>
      )}
    </div>
  );
}
