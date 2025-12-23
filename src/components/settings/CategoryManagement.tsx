import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Trash2, Plus } from 'lucide-react';
import { toast } from 'sonner';

interface Sector {
  id: string;
  name: string;
}

interface SectorCategory {
  id: string;
  sector_id: string;
  category_name: string;
  created_at: string;
}

const DEFAULT_CATEGORIES = [
  'Hardware',
  'Software',
  'Rede',
  'Email',
  'Acesso/Permissões',
  'Impressora',
  'Outros',
];

export default function CategoryManagement() {
  const { role } = useAuth();
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [selectedSector, setSelectedSector] = useState<string>('');
  const [categories, setCategories] = useState<SectorCategory[]>([]);
  const [newCategory, setNewCategory] = useState('');
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [tableExists, setTableExists] = useState(true);

  useEffect(() => {
    fetchSectors();
  }, []);

  useEffect(() => {
    if (selectedSector) {
      fetchCategories(selectedSector);
    }
  }, [selectedSector]);

  const fetchSectors = async () => {
    try {
      const { data, error } = await (supabase as any)
        .from('sectors')
        .select('id, name')
        .order('name');
      
      if (error) throw error;
      setSectors(data || []);
      if (data && data.length > 0) {
        setSelectedSector(data[0].id);
      }
    } catch (err) {
      console.error('Erro ao carregar setores:', err);
      toast.error('Erro ao carregar setores');
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async (sectorId: string) => {
    try {
      const { data, error } = await (supabase as any)
        .from('sector_categories')
        .select('*')
        .eq('sector_id', sectorId)
        .order('category_name');
      
      // Se tabela não existe (404), setar flag e usar categorias padrão
      if (error && (error.code === 'PGRST116' || error.message?.includes('404'))) {
        setTableExists(false);
        setCategories([]);
        return;
      }

      if (error) {
        console.error('Erro ao carregar categorias:', error);
        setCategories([]);
        return;
      }

      setCategories(data || []);
      setTableExists(true);
    } catch (err) {
      console.error('Erro ao carregar categorias:', err);
      setCategories([]);
      setTableExists(false);
    }
  };

  const addCategory = async () => {
    try {
      if (!newCategory.trim()) {
        toast.error('Digite um nome para a categoria');
        return;
      }

      if (!tableExists) {
        toast.error('Tabela de categorias ainda não foi criada no banco de dados. Execute a migration no Supabase.');
        return;
      }

      const { error } = await (supabase as any)
        .from('sector_categories')
        .insert({
          sector_id: selectedSector,
          category_name: newCategory.trim(),
        });

      if (error && (error.code === 'PGRST116' || error.message?.includes('404'))) {
        setTableExists(false);
        toast.error('Tabela de categorias não existe. Execute a migration no Supabase.');
        return;
      }

      if (error) throw error;

      toast.success('Categoria adicionada com sucesso');
      setNewCategory('');
      setDialogOpen(false);
      fetchCategories(selectedSector);
    } catch (err: any) {
      console.error('Erro ao adicionar categoria:', err);
      if (err.code === '23505') {
        toast.error('Esta categoria já existe para este setor');
      } else {
        toast.error('Erro ao adicionar categoria');
      }
    }
  };

  const deleteCategory = async (categoryId: string) => {
    if (!confirm('Tem certeza que deseja deletar esta categoria?')) {
      return;
    }

    try {
      if (!tableExists) {
        toast.error('Tabela de categorias não existe');
        return;
      }

      const { error } = await (supabase as any)
        .from('sector_categories')
        .delete()
        .eq('id', categoryId);

      if (error && (error.code === 'PGRST116' || error.message?.includes('404'))) {
        setTableExists(false);
        toast.error('Tabela de categorias não existe');
        return;
      }

      if (error) throw error;

      toast.success('Categoria deletada com sucesso');
      fetchCategories(selectedSector);
    } catch (err) {
      console.error('Erro ao deletar categoria:', err);
      toast.error('Erro ao deletar categoria');
    }
  };

  if (role !== 'admin') {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Você não tem permissão para gerenciar categorias. Apenas administradores podem acessar esta funcionalidade.
        </AlertDescription>
      </Alert>
    );
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Gerenciamento de Categorias</h2>
        <p className="text-muted-foreground">Configure as categorias de chamados por setor</p>
      </div>

      {!tableExists && (
        <Alert variant="destructive">
          <AlertDescription>
            ⚠️ <strong>Tabela de categorias não existe.</strong> Execute a migration SQL no Supabase para ativar este recurso. 
            Enquanto isso, as categorias padrão serão usadas.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Selecionar Setor</CardTitle>
          <CardDescription>Escolha um setor para gerenciar suas categorias</CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={selectedSector} onValueChange={setSelectedSector}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione um setor" />
            </SelectTrigger>
            <SelectContent>
              {sectors.map((sector) => (
                <SelectItem key={sector.id} value={sector.id}>
                  {sector.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Categorias do Setor</CardTitle>
            <CardDescription>
              Categorias disponíveis para chamados neste setor
            </CardDescription>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Adicionar Categoria
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Adicionar Nova Categoria</DialogTitle>
                <DialogDescription>
                  Adicione uma nova categoria para o setor selecionado
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Nome da Categoria</label>
                  <Input
                    placeholder="Ex: Hardware"
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        addCategory();
                      }
                    }}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setDialogOpen(false)}
                  >
                    Cancelar
                  </Button>
                  <Button onClick={addCategory}>
                    Adicionar
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {categories.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              Nenhuma categoria configurada para este setor
            </p>
          ) : (
            <div className="space-y-2">
              {categories.map((category) => (
                <div
                  key={category.id}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent"
                >
                  <span className="font-medium">{category.category_name}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteCategory(category.id)}
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
