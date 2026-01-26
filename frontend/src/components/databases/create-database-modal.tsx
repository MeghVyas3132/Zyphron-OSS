'use client';

import { useState } from 'react';
import { Database, Loader2, X, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCreateDatabase } from '@/hooks/use-databases';

interface CreateDatabaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

type DatabaseType = 'POSTGRESQL' | 'MYSQL' | 'MONGODB' | 'REDIS';

const databaseTypes: {
  type: DatabaseType;
  name: string;
  icon: string;
  description: string;
  versions: string[];
  defaultVersion: string;
}[] = [
  {
    type: 'POSTGRESQL',
    name: 'PostgreSQL',
    icon: '🐘',
    description: 'Powerful, open source object-relational database',
    versions: ['16', '15', '14', '13'],
    defaultVersion: '16',
  },
  {
    type: 'MYSQL',
    name: 'MySQL',
    icon: '🐬',
    description: 'Popular open-source relational database',
    versions: ['8.0', '5.7'],
    defaultVersion: '8.0',
  },
  {
    type: 'MONGODB',
    name: 'MongoDB',
    icon: '🍃',
    description: 'Document-oriented NoSQL database',
    versions: ['7.0', '6.0', '5.0'],
    defaultVersion: '7.0',
  },
  {
    type: 'REDIS',
    name: 'Redis',
    icon: '⚡',
    description: 'In-memory data structure store and cache',
    versions: ['7.2', '7.0', '6.2'],
    defaultVersion: '7.2',
  },
];

export function CreateDatabaseModal({ isOpen, onClose, onSuccess }: CreateDatabaseModalProps) {
  const [step, setStep] = useState<'select' | 'configure' | 'creating'>('select');
  const [selectedType, setSelectedType] = useState<DatabaseType | null>(null);
  const [name, setName] = useState('');
  const [version, setVersion] = useState('');
  const [error, setError] = useState('');
  
  const createMutation = useCreateDatabase();

  const selectedDbConfig = databaseTypes.find((db) => db.type === selectedType);

  const handleSelectType = (type: DatabaseType) => {
    const config = databaseTypes.find((db) => db.type === type);
    setSelectedType(type);
    setVersion(config?.defaultVersion || '');
    setStep('configure');
  };

  const handleBack = () => {
    if (step === 'configure') {
      setStep('select');
      setSelectedType(null);
    }
  };

  const handleCreate = async () => {
    if (!selectedType || !name.trim()) {
      setError('Please enter a database name');
      return;
    }

    setError('');
    setStep('creating');

    try {
      await createMutation.mutateAsync({
        name: name.trim(),
        type: selectedType,
        version,
      });
      
      // Reset and close
      setTimeout(() => {
        setStep('select');
        setSelectedType(null);
        setName('');
        setVersion('');
        onSuccess?.();
        onClose();
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create database');
      setStep('configure');
    }
  };

  const handleClose = () => {
    if (step !== 'creating') {
      setStep('select');
      setSelectedType(null);
      setName('');
      setVersion('');
      setError('');
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50" 
        onClick={handleClose}
      />
      
      {/* Modal */}
      <div className="relative bg-background rounded-lg shadow-lg w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">
              {step === 'select' && 'Create New Database'}
              {step === 'configure' && `Configure ${selectedDbConfig?.name}`}
              {step === 'creating' && 'Creating Database...'}
            </h2>
          </div>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={handleClose}
            disabled={step === 'creating'}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="p-4">
          {/* Step 1: Select Database Type */}
          {step === 'select' && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Choose the type of database you want to create.
              </p>
              <div className="grid gap-3">
                {databaseTypes.map((db) => (
                  <button
                    key={db.type}
                    onClick={() => handleSelectType(db.type)}
                    className="flex items-start gap-4 p-4 rounded-lg border hover:border-primary hover:bg-muted/50 transition-colors text-left"
                  >
                    <span className="text-3xl">{db.icon}</span>
                    <div className="flex-1">
                      <h3 className="font-medium">{db.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        {db.description}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: Configure */}
          {step === 'configure' && selectedDbConfig && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                <span className="text-2xl">{selectedDbConfig.icon}</span>
                <div>
                  <p className="font-medium">{selectedDbConfig.name}</p>
                  <p className="text-xs text-muted-foreground">{selectedDbConfig.description}</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="db-name">Database Name</Label>
                  <Input
                    id="db-name"
                    placeholder="my-database"
                    value={name}
                    onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                    className="font-mono"
                  />
                  <p className="text-xs text-muted-foreground">
                    Lowercase letters, numbers, and hyphens only
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="db-version">Version</Label>
                  <select
                    id="db-version"
                    value={version}
                    onChange={(e) => setVersion(e.target.value)}
                    className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                  >
                    {selectedDbConfig.versions.map((v) => (
                      <option key={v} value={v}>
                        {selectedDbConfig.name} {v}
                      </option>
                    ))}
                  </select>
                </div>

                {error && (
                  <div className="p-3 bg-destructive/10 text-destructive rounded-lg text-sm">
                    {error}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 3: Creating */}
          {step === 'creating' && (
            <div className="flex flex-col items-center justify-center py-8">
              {createMutation.isSuccess ? (
                <>
                  <CheckCircle2 className="h-12 w-12 text-green-500 mb-4" />
                  <p className="text-lg font-medium">Database Created!</p>
                  <p className="text-sm text-muted-foreground">
                    Your {selectedDbConfig?.name} database is being provisioned.
                  </p>
                </>
              ) : (
                <>
                  <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
                  <p className="text-lg font-medium">Creating Database...</p>
                  <p className="text-sm text-muted-foreground">
                    Setting up your {selectedDbConfig?.name} instance.
                  </p>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {step !== 'creating' && (
          <div className="flex items-center justify-between p-4 border-t bg-muted/50">
            {step === 'configure' ? (
              <>
                <Button variant="ghost" onClick={handleBack}>
                  Back
                </Button>
                <Button onClick={handleCreate} disabled={!name.trim()}>
                  Create Database
                </Button>
              </>
            ) : (
              <div className="flex-1 text-right">
                <Button variant="ghost" onClick={handleClose}>
                  Cancel
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
