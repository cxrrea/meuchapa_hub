import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import AppLayout from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { Clock, Timer, TrendingUp, Users, CheckCircle, AlertCircle, Target, AlertTriangle, XCircle, Calendar, Mail } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { format, differenceInMinutes, startOfDay, endOfDay, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface TicketWithTimes {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  first_response_at: string | null;
  closed_at: string | null;
  assigned_to: string | null;
  status_id: string | null;
  priority: string | null;
  ticket_statuses: { name: string } | null;
  profiles: { full_name: string } | null;
}

interface AnalystMetrics {
  analyst_id: string;
  analyst_name: string;
  total_tickets: number;
  avg_response_time: number;
  avg_resolution_time: number;
  resolved_tickets: number;
  sla_response_compliance: number;
  sla_resolution_compliance: number;
}

// SLA targets in minutes
const SLA_TARGETS = {
  response: {
    urgent: 30,    // 30 minutes
    high: 60,      // 1 hour
    medium: 240,   // 4 hours
    low: 480,      // 8 hours
  },
  resolution: {
    urgent: 240,   // 4 hours
    high: 480,     // 8 hours
    medium: 1440,  // 24 hours
    low: 2880,     // 48 hours
  }
};

export default function Analytics() {
  const { isStaff, loading: authLoading, profile, role } = useAuth();
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<TicketWithTimes[]>([]);
  const [loading, setLoading] = useState(true);
  const [analystMetrics, setAnalystMetrics] = useState<AnalystMetrics[]>([]);
  const [dateRange, setDateRange] = useState({
    start: format(subDays(new Date(), 90), 'yyyy-MM-dd'),
    end: format(new Date(), 'yyyy-MM-dd'),
  });
  const [selectedAnalyst, setSelectedAnalyst] = useState<string>('all');

  useEffect(() => {
    if (!authLoading && !isStaff) {
      navigate('/');
    }
  }, [authLoading, isStaff, navigate]);

  const getSlaTarget = useCallback((priority: string | null, type: 'response' | 'resolution'): number => {
    const p = (priority || 'medium') as keyof typeof SLA_TARGETS.response;
    return SLA_TARGETS[type][p] || SLA_TARGETS[type].medium;
  }, []);

  const isWithinSla = useCallback((ticket: TicketWithTimes, type: 'response' | 'resolution'): boolean | null => {
    const target = getSlaTarget(ticket.priority, type);
    
    if (type === 'response') {
      if (!ticket.first_response_at) return null;
      const responseTime = differenceInMinutes(
        new Date(ticket.first_response_at),
        new Date(ticket.created_at)
      );
      return responseTime <= target;
    } else {
      if (!ticket.closed_at) return null;
      const resolutionTime = differenceInMinutes(
        new Date(ticket.closed_at),
        new Date(ticket.created_at)
      );
      return resolutionTime <= target;
    }
  }, [getSlaTarget]);

  const calculateAnalystMetrics = useCallback((ticketsData: TicketWithTimes[]) => {
    const metricsMap = new Map<string, AnalystMetrics>();

    ticketsData.forEach(ticket => {
      if (!ticket.assigned_to) return;

      const existing = metricsMap.get(ticket.assigned_to) || {
        analyst_id: ticket.assigned_to,
        analyst_name: ticket.profiles?.full_name || 'Desconhecido',
        total_tickets: 0,
        avg_response_time: 0,
        avg_resolution_time: 0,
        resolved_tickets: 0,
        sla_response_compliance: 0,
        sla_resolution_compliance: 0,
      };

      existing.total_tickets++;

      if (ticket.first_response_at) {
        const responseTime = differenceInMinutes(
          new Date(ticket.first_response_at),
          new Date(ticket.created_at)
        );
        existing.avg_response_time = 
          (existing.avg_response_time * (existing.total_tickets - 1) + responseTime) / existing.total_tickets;
      }

      if (ticket.closed_at) {
        existing.resolved_tickets++;
        const resolutionTime = differenceInMinutes(
          new Date(ticket.closed_at),
          new Date(ticket.created_at)
        );
        existing.avg_resolution_time = 
          (existing.avg_resolution_time * (existing.resolved_tickets - 1) + resolutionTime) / existing.resolved_tickets;
      }

      metricsMap.set(ticket.assigned_to, existing);
    });

    const metrics = Array.from(metricsMap.values()).map(analyst => {
      const analystTickets = ticketsData.filter(t => t.assigned_to === analyst.analyst_id);
      
      const ticketsWithResponse = analystTickets.filter(t => t.first_response_at);
      const ticketsWithinResponseSla = ticketsWithResponse.filter(t => isWithinSla(t, 'response'));
      
      const ticketsResolved = analystTickets.filter(t => t.closed_at);
      const ticketsWithinResolutionSla = ticketsResolved.filter(t => isWithinSla(t, 'resolution'));

      return {
        ...analyst,
        sla_response_compliance: ticketsWithResponse.length > 0 
          ? (ticketsWithinResponseSla.length / ticketsWithResponse.length) * 100 
          : 0,
        sla_resolution_compliance: ticketsResolved.length > 0 
          ? (ticketsWithinResolutionSla.length / ticketsResolved.length) * 100 
          : 0,
      };
    });

    setAnalystMetrics(metrics);
  }, [isWithinSla]);

  const fetchTicketsWithMetrics = useCallback(async () => {
    setLoading(true);
    
    // Use ISO string comparison for reliable date filtering
    const startDate = new Date(dateRange.start);
    startDate.setUTCHours(0, 0, 0, 0);
    const endDate = new Date(dateRange.end);
    endDate.setUTCHours(23, 59, 59, 999);

    const { data: allTicketsData, error: allError } = await supabase
      .from('tickets')
      .select(`
        id,
        title,
        created_at,
        updated_at,
        first_response_at,
        closed_at,
        assigned_to,
        status_id,
        priority,
        ticket_statuses (name),
        profiles:assigned_to (full_name)
      `)
      .order('created_at', { ascending: false });

    console.log('=== ANALYTICS DEBUG ===');
    console.log('All tickets count:', allTicketsData?.length);
    console.log('Date range start:', startDate.toISOString());
    console.log('Date range end:', endDate.toISOString());

    if (allError) {
      console.error('Error fetching all tickets:', allError);
      setLoading(false);
      return;
    }

    if (allTicketsData) {
      const filteredTickets = (allTicketsData as unknown as TicketWithTimes[]).filter(t => {
        const createdDate = new Date(t.created_at);
        const isInRange = createdDate >= startDate && createdDate <= endDate;
        console.log(`Ticket ${t.id} created: ${createdDate.toISOString()}, in range: ${isInRange}`);
        return isInRange;
      });

      console.log('Filtered tickets count:', filteredTickets.length);
      
      setTickets(filteredTickets);
      // Only calculate analyst metrics for assigned tickets
      const assignedTickets = filteredTickets.filter(t => t.assigned_to !== null);
      calculateAnalystMetrics(assignedTickets);
    }
    
    setLoading(false);
  }, [dateRange, calculateAnalystMetrics]);

  useEffect(() => {
    if (isStaff) {
      fetchTicketsWithMetrics();
    }
  }, [isStaff, fetchTicketsWithMetrics]);

  const formatMinutes = (minutes: number): string => {
    if (minutes < 60) return `${Math.round(minutes)} min`;
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    if (hours < 24) return `${hours}h ${mins}min`;
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  };

  const handleDateChange = (type: 'start' | 'end', value: string) => {
    setDateRange(prev => ({
      ...prev,
      [type]: value
    }));
  };

  const handleQuickFilter = (days: number) => {
    const end = new Date();
    const start = subDays(end, days);
    setDateRange({
      start: format(start, 'yyyy-MM-dd'),
      end: format(end, 'yyyy-MM-dd'),
    });
  };

  // Only count assigned tickets for metrics
  // Analysts see only their tickets, admins see all or filtered by selection
  const assignedTickets = tickets.filter(t => {
    if (!t.assigned_to) return false;
    
    if (role === 'admin') {
      // If admin selected a specific analyst, filter by that
      if (selectedAnalyst !== 'all') {
        return t.assigned_to === selectedAnalyst;
      }
      // Otherwise show all
      return true;
    }
    // Analysts see only their own tickets
    return t.assigned_to === profile?.id;
  });
  
  // Calculate overall SLA stats (only for assigned tickets)
  const ticketsWithResponse = assignedTickets.filter(t => t.first_response_at);
  const ticketsWithinResponseSla = ticketsWithResponse.filter(t => isWithinSla(t, 'response'));
  const ticketsResolved = assignedTickets.filter(t => t.closed_at);
  const ticketsWithinResolutionSla = ticketsResolved.filter(t => isWithinSla(t, 'resolution'));

  const slaStats = {
    responseCompliance: ticketsWithResponse.length > 0 
      ? (ticketsWithinResponseSla.length / ticketsWithResponse.length) * 100 
      : 0,
    resolutionCompliance: ticketsResolved.length > 0 
      ? (ticketsWithinResolutionSla.length / ticketsResolved.length) * 100 
      : 0,
  };

  const overallStats = {
    totalTickets: assignedTickets.length,
    respondedTickets: assignedTickets.filter(t => t.first_response_at).length,
    resolvedTickets: assignedTickets.filter(t => t.closed_at).length,
    avgResponseTime: assignedTickets.reduce((acc, t) => {
      if (t.first_response_at) {
        return acc + differenceInMinutes(new Date(t.first_response_at), new Date(t.created_at));
      }
      return acc;
    }, 0) / (assignedTickets.filter(t => t.first_response_at).length || 1),
    avgResolutionTime: assignedTickets.reduce((acc, t) => {
      if (t.closed_at) {
        return acc + differenceInMinutes(new Date(t.closed_at), new Date(t.created_at));
      }
      return acc;
    }, 0) / (assignedTickets.filter(t => t.closed_at).length || 1),
  };

  const getSlaComplianceColor = (compliance: number): string => {
    if (compliance >= 90) return 'text-green-600';
    if (compliance >= 70) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getSlaComplianceIcon = (compliance: number) => {
    if (compliance >= 90) return <CheckCircle className="h-4 w-4 text-green-500" />;
    if (compliance >= 70) return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    return <XCircle className="h-4 w-4 text-red-500" />;
  };

  if (authLoading || loading) {
    return (
      <AppLayout>
        <div className="space-y-6">
          <Skeleton className="h-8 w-64" />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Métricas de Atendimento</h1>
          <p className="text-muted-foreground">
            Acompanhe o desempenho da equipe de suporte
          </p>
        </div>

        {/* Date Filter */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Calendar className="h-4 w-4" />
              Filtro de Período
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <label className="text-sm font-medium mb-2 block">Data Inicial</label>
                <Input
                  type="date"
                  value={dateRange.start}
                  onChange={(e) => handleDateChange('start', e.target.value)}
                  className="w-full"
                />
              </div>
              <div className="flex-1">
                <label className="text-sm font-medium mb-2 block">Data Final</label>
                <Input
                  type="date"
                  value={dateRange.end}
                  onChange={(e) => handleDateChange('end', e.target.value)}
                  className="w-full"
                />
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleQuickFilter(7)}
              >
                Últimos 7 dias
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleQuickFilter(30)}
              >
                Últimos 30 dias
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleQuickFilter(90)}
              >
                Últimos 90 dias
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Analyst Filter for Admin */}
        {role === 'admin' && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Filtro por Analista</CardTitle>
            </CardHeader>
            <CardContent>
              <Select value={selectedAnalyst} onValueChange={setSelectedAnalyst}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um analista" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Analistas</SelectItem>
                  {Array.from(new Map(
                    (tickets || [])
                      .filter(t => t.assigned_to !== null)
                      .map(t => [t.assigned_to, { id: t.assigned_to, name: t.profiles?.full_name || 'Desconhecido' }])
                  ).values()).map(analyst => (
                    <SelectItem key={analyst.id} value={analyst.id}>
                      {analyst.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
        )}

        {/* Overall Stats */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total de Chamados</CardTitle>
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{overallStats.totalTickets}</div>
              <p className="text-xs text-muted-foreground">
                Todos os chamados registrados
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Chamados Respondidos</CardTitle>
              <Mail className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{overallStats.respondedTickets}</div>
              <p className="text-xs text-muted-foreground">
                {((overallStats.respondedTickets / overallStats.totalTickets) * 100 || 0).toFixed(1)}% do total
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Chamados Resolvidos</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{overallStats.resolvedTickets}</div>
              <p className="text-xs text-muted-foreground">
                {((overallStats.resolvedTickets / overallStats.totalTickets) * 100 || 0).toFixed(1)}% do total
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Tempo Médio de Resposta</CardTitle>
              <Clock className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatMinutes(overallStats.avgResponseTime)}</div>
              <p className="text-xs text-muted-foreground">
                Primeira resposta ao usuário
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Tempo Médio de Resolução</CardTitle>
              <Timer className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatMinutes(overallStats.avgResolutionTime)}</div>
              <p className="text-xs text-muted-foreground">
                Do abertura ao fechamento
              </p>
            </CardContent>
          </Card>
        </div>

        {/* SLA Metrics */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Métricas de SLA
            </CardTitle>
            <CardDescription>
              Cumprimento dos acordos de nível de serviço por prioridade
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              {/* Response SLA */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">SLA de Primeira Resposta</h4>
                  {getSlaComplianceIcon(slaStats.responseCompliance)}
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Cumprimento</span>
                    <span className={getSlaComplianceColor(slaStats.responseCompliance)}>
                      {slaStats.responseCompliance.toFixed(1)}%
                    </span>
                  </div>
                  <Progress value={slaStats.responseCompliance} className="h-2" />
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="p-2 rounded bg-muted/50">
                    <p className="text-muted-foreground">Dentro do SLA</p>
                    <p className="font-medium text-green-600">{ticketsWithinResponseSla.length}</p>
                  </div>
                  <div className="p-2 rounded bg-muted/50">
                    <p className="text-muted-foreground">Fora do SLA</p>
                    <p className="font-medium text-red-600">{ticketsWithResponse.length - ticketsWithinResponseSla.length}</p>
                  </div>
                </div>
              </div>

              {/* Resolution SLA */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">SLA de Resolução</h4>
                  {getSlaComplianceIcon(slaStats.resolutionCompliance)}
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Cumprimento</span>
                    <span className={getSlaComplianceColor(slaStats.resolutionCompliance)}>
                      {slaStats.resolutionCompliance.toFixed(1)}%
                    </span>
                  </div>
                  <Progress value={slaStats.resolutionCompliance} className="h-2" />
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="p-2 rounded bg-muted/50">
                    <p className="text-muted-foreground">Dentro do SLA</p>
                    <p className="font-medium text-green-600">{ticketsWithinResolutionSla.length}</p>
                  </div>
                  <div className="p-2 rounded bg-muted/50">
                    <p className="text-muted-foreground">Fora do SLA</p>
                    <p className="font-medium text-red-600">{ticketsResolved.length - ticketsWithinResolutionSla.length}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* SLA Targets Reference */}
            <div className="border-t pt-4">
              <h4 className="font-medium mb-3">Metas de SLA por Prioridade</h4>
              <div className="grid gap-2 md:grid-cols-4">
                {(['urgent', 'high', 'medium', 'low'] as const).map((priority) => (
                  <div key={priority} className="p-3 rounded-lg bg-muted/50">
                    <Badge variant="outline" className="mb-2">
                      {priority === 'urgent' ? 'Urgente' : 
                       priority === 'high' ? 'Alta' : 
                       priority === 'medium' ? 'Média' : 'Baixa'}
                    </Badge>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Resposta:</span>
                        <span>{formatMinutes(SLA_TARGETS.response[priority])}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Resolução:</span>
                        <span>{formatMinutes(SLA_TARGETS.resolution[priority])}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Analyst Performance with SLA */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Desempenho por Analista
            </CardTitle>
            <CardDescription>
              Métricas individuais e cumprimento de SLA
            </CardDescription>
          </CardHeader>
          <CardContent>
            {analystMetrics.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                Nenhum analista com chamados atribuídos no período selecionado
              </p>
            ) : (
              <div className="space-y-4">
                {analystMetrics.map((analyst) => {
                  // Calculate average assumption time for this analyst
                  const analystTickets = tickets.filter(t => t.assigned_to === analyst.analyst_id);
                  const avgAssumptionTime = analystTickets.reduce((acc, t) => {
                    // Use updated_at as assignment time
                    const assignmentTime = t.updated_at;
                    if (assignmentTime) {
                      return acc + differenceInMinutes(new Date(assignmentTime), new Date(t.created_at));
                    }
                    return acc;
                  }, 0) / (analystTickets.length || 1);

                  return (
                    <div
                      key={analyst.analyst_id}
                      className="p-4 rounded-lg bg-muted/50 space-y-4"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">{analyst.analyst_name}</p>
                          <p className="text-sm text-muted-foreground">
                            {analyst.total_tickets} chamados atribuídos • {analyst.resolved_tickets} resolvidos
                          </p>
                        </div>
                        <div className="flex gap-4 text-right">
                          <div>
                            <p className="text-sm text-muted-foreground">Tempo Assunção</p>
                            <p className="font-medium">{formatMinutes(avgAssumptionTime)}</p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">Resp. Média</p>
                            <p className="font-medium">{formatMinutes(analyst.avg_response_time)}</p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">Resolução</p>
                            <p className="font-medium">{formatMinutes(analyst.avg_resolution_time)}</p>
                          </div>
                        </div>
                      </div>
                      
                      {/* SLA Compliance Bars */}
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="space-y-1">
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">SLA Resposta</span>
                            <span className={getSlaComplianceColor(analyst.sla_response_compliance)}>
                              {analyst.sla_response_compliance.toFixed(1)}%
                            </span>
                          </div>
                          <Progress value={analyst.sla_response_compliance} className="h-1.5" />
                        </div>
                        <div className="space-y-1">
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">SLA Resolução</span>
                            <span className={getSlaComplianceColor(analyst.sla_resolution_compliance)}>
                              {analyst.sla_resolution_compliance.toFixed(1)}%
                            </span>
                          </div>
                          <Progress value={analyst.sla_resolution_compliance} className="h-1.5" />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Tickets with Times */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Últimos Chamados com Métricas
            </CardTitle>
            <CardDescription>
              Tempos de atendimento dos chamados recentes
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {tickets.slice(0, 10).map((ticket) => {
                const assumptionTime = ticket.updated_at
                  ? differenceInMinutes(new Date(ticket.updated_at), new Date(ticket.created_at))
                  : null;
                const responseTime = ticket.first_response_at
                  ? differenceInMinutes(new Date(ticket.first_response_at), new Date(ticket.created_at))
                  : null;
                const resolutionTime = ticket.closed_at
                  ? differenceInMinutes(new Date(ticket.closed_at), new Date(ticket.created_at))
                  : null;
                
                const responseSla = isWithinSla(ticket, 'response');
                const resolutionSla = isWithinSla(ticket, 'resolution');

                return (
                  <div
                    key={ticket.id}
                    className="flex flex-col p-3 rounded-lg border space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{ticket.title}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <p className="text-sm text-muted-foreground">
                            {format(new Date(ticket.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                          </p>
                          {ticket.priority && (
                            <Badge variant="outline" className="text-xs">
                              {ticket.priority === 'urgent' ? 'Urgente' : 
                               ticket.priority === 'high' ? 'Alta' : 
                               ticket.priority === 'medium' ? 'Média' : 'Baixa'}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <div className="grid gap-3 md:grid-cols-4">
                      <div className="text-sm">
                        <p className="text-muted-foreground">Assumido</p>
                        <div className="flex items-center gap-1 mt-1">
                          <Clock className="h-3 w-3 text-blue-500" />
                          <p className="font-medium">{assumptionTime !== null ? formatMinutes(assumptionTime) : '-'}</p>
                        </div>
                      </div>
                      <div className="text-sm">
                        <p className="text-muted-foreground">1ª Resposta</p>
                        <div className="flex items-center gap-1 mt-1">
                          {responseSla !== null && (
                            responseSla ? 
                              <CheckCircle className="h-3 w-3 text-green-500" /> : 
                              <XCircle className="h-3 w-3 text-red-500" />
                          )}
                          <p className={responseTime !== null 
                            ? (responseSla ? 'text-green-600' : 'text-red-600') + ' font-medium' 
                            : 'text-muted-foreground'}>
                            {responseTime !== null ? formatMinutes(responseTime) : '-'}
                          </p>
                        </div>
                      </div>
                      <div className="text-sm">
                        <p className="text-muted-foreground">Resolução</p>
                        <div className="flex items-center gap-1 mt-1">
                          {resolutionSla !== null && (
                            resolutionSla ? 
                              <CheckCircle className="h-3 w-3 text-green-500" /> : 
                              <XCircle className="h-3 w-3 text-red-500" />
                          )}
                          <p className={resolutionTime !== null 
                            ? (resolutionSla ? 'text-green-600' : 'text-red-600') + ' font-medium' 
                            : 'text-muted-foreground'}>
                            {resolutionTime !== null ? formatMinutes(resolutionTime) : '-'}
                          </p>
                        </div>
                      </div>
                      <div className="text-sm">
                        <p className="text-muted-foreground">Analista</p>
                        <p className="font-medium mt-1">{ticket.profiles?.full_name || '-'}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
