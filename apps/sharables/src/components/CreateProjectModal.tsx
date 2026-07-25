import React, { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface CreateProjectModalProps {
    isOpen: boolean;
    onClose: () => void;
    onCreate: (name: string) => void;
}

export function CreateProjectModal({ isOpen, onClose, onCreate }: CreateProjectModalProps) {
    const [name, setName] = useState('');

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (name.trim()) {
            onCreate(name.trim());
            setName('');
            onClose();
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-full max-w-md bg-background border border-border rounded-xl shadow-2xl p-6 m-4 animate-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-semibold">Create New Project</h2>
                    <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <label htmlFor="projectName" className="text-sm font-medium text-muted-foreground">
                            Project Name
                        </label>
                        <Input
                            id="projectName"
                            placeholder="e.g., My Awesome App"
                            value={name}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
                            autoFocus
                            className="bg-muted/50 mt-2"
                        />
                    </div>

                    <div className="flex justify-end gap-3 pt-2">
                        <Button type="button" variant="ghost" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={!name.trim()}>
                            Create Project
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}
