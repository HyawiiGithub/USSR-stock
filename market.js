// market.js - Red Star Market Dashboard Client

const MarketClient = {
  ws: null,
  reconnectAttempts: 0,
  maxReconnectAttempts: 5,
  updateInterval: null,
  chartInstance: null,
  
  // Initialize the market client
  init() {
    this.setupWebSocket();
    this.startPolling();
    this.bindEvents();
    this.loadInitialData();
  },
  
  // WebSocket connection for real-time updates
  setupWebSocket() {
    const wsUrl = CONFIG.WS_URL || 'wss://ussr-stock-api.batuhanylz2009.workers.dev/ws';
    
    try {
      this.ws = new WebSocket(wsUrl);
      
      this.ws.onopen = () => {
        console.log('Market WebSocket connected');
        this.reconnectAttempts = 0;
        this.updateConnectionStatus('online');
      };
      
      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleMarketUpdate(data);
        } catch (e) {
          console.warn('WS message parse error:', e);
        }
      };
      
      this.ws.onclose = () => {
        console.warn('Market WebSocket closed');
        this.updateConnectionStatus('error');
        this.reconnect();
      };
      
      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        this.updateConnectionStatus('error');
      };
    } catch (e) {
      console.warn('WebSocket not available, using polling:', e);
      this.updateConnectionStatus('error');
    }
  },
  
  // Reconnect WebSocket
  reconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.warn('Max reconnect attempts reached, using polling');
      return;
    }
    
    this.reconnectAttempts++;
    setTimeout(() => this.setupWebSocket(), 3000 * this.reconnectAttempts);
  },
  
  // Handle market updates from WebSocket
  handleMarketUpdate(data) {
    if (data.type === 'price_update') {
      this.updatePrice(data);
    } else if (data.type === 'market_status') {
      this.updateStatus(data);
    } else if (data.type === 'portfolio_update') {
      this.updatePortfolio(data);
    } else if (data.type === 'event_update') {
      this.addEvent(data);
    } else if (data.type === 'order_book') {
      this.updateOrderBook(data);
    }
  },
  
  // Start polling for updates (fallback)
  startPolling() {
    this.updateInterval = setInterval(() => {
      this.fetchMarketData();
    }, 10000);
  },
  
  // Fetch market data from API
  async fetchMarketData() {
    try {
      const response = await fetch(`${CONFIG.API_BASE_URL}/api/public/market`, {
        credentials: 'include'
      });
      const data = await response.json();
      this.updateMarketUI(data);
    } catch (e) {
      console.warn('Market data fetch error:', e);
    }
  },
  
  // Load initial data
  async loadInitialData() {
    try {
      // Load market data
      const marketRes = await fetch(`${CONFIG.API_BASE_URL}/api/public/market`, {
        credentials: 'include'
      });
      const marketData = await marketRes.json();
      this.updateMarketUI(marketData);
      
      // Load economy data
      const economyRes = await fetch(`${CONFIG.API_BASE_URL}/api/public/economy`, {
        credentials: 'include'
      });
      const economyData = await economyRes.json();
      this.updateEconomyUI(economyData);
      
      // Load portfolio if logged in
      if (STATE.user) {
        this.loadPortfolio();
        this.loadWatchlist();
        this.loadOrders();
      }
      
      // Load events
      this.loadEvents();
      
    } catch (e) {
      console.warn('Initial data load error:', e);
    }
  },
  
  // Load portfolio data
  async loadPortfolio() {
    try {
      const response = await fetch(`${CONFIG.API_BASE_URL}/api/portfolio`, {
        credentials: 'include'
      });
      const data = await response.json();
      this.updatePortfolioUI(data);
    } catch (e) {
      console.warn('Portfolio load error:', e);
    }
  },
  
  // Load watchlist
  async loadWatchlist() {
    try {
      const response = await fetch(`${CONFIG.API_BASE_URL}/api/watchlist`, {
        credentials: 'include'
      });
      const data = await response.json();
      this.updateWatchlistUI(data);
    } catch (e) {
      console.warn('Watchlist load error:', e);
    }
  },
  
  // Load orders
  async loadOrders() {
    try {
      const response = await fetch(`${CONFIG.API_BASE_URL}/api/orders`, {
        credentials: 'include'
      });
      const data = await response.json();
      this.updateOrdersUI(data);
    } catch (e) {
      console.warn('Orders load error:', e);
    }
  },
  
  // Load events
  async loadEvents() {
    try {
      const response = await fetch(`${CONFIG.API_BASE_URL}/api/public/events`, {
        credentials: 'include'
      });
      const data = await response.json();
      this.updateEventsUI(data);
    } catch (e) {
      console.warn('Events load error:', e);
    }
  },
  
  // Update market UI
  updateMarketUI(data) {
    const market = data.market || data;
    
    // Update index
    const indexEl = document.getElementById('redStarIndex');
    if (indexEl) {
      indexEl.textContent = market.price ? `₽${market.price.toFixed(2)}` : '--';
    }
    
    // Update change
    const changeEl = document.getElementById('indexChange');
    if (changeEl && market.changePercent !== undefined) {
      const change = market.changePercent;
      changeEl.textContent = `${change > 0 ? '+' : ''}${change.toFixed(2)}%`;
      changeEl.className = `overview-change ${change >= 0 ? 'positive' : 'negative'}`;
    }
    
    // Update market cap
    const capEl = document.getElementById('marketCap');
    if (capEl && market.marketCap !== undefined) {
      capEl.textContent = `₽${market.marketCap.toLocaleString()}`;
    }
    
    // Update status
    const statusEl = document.getElementById('marketStatusDisplay');
    if (statusEl) {
      const status = market.status || 'closed';
      statusEl.textContent = status.toUpperCase();
      statusEl.className = `overview-value status-${status}`;
    }
    
    // Update chart
    this.updateChart(market.history || []);
  },
  
  // Update economy UI
  updateEconomyUI(data) {
    const economy = data.economy || data;
    
    // Update risk
    const riskEl = document.getElementById('riskLevel');
    if (riskEl) {
      const risk = economy.risk || 'low';
      riskEl.textContent = risk.toUpperCase();
      riskEl.className = `risk-level ${risk}`;
    }
    
    // Update inflation
    const inflationEl = document.getElementById('inflationDisplay');
    if (inflationEl && economy.inflation !== undefined) {
      inflationEl.textContent = `${economy.inflation.toFixed(1)}%`;
    }
    
    // Update liquidity
    const liquidityEl = document.getElementById('liquidityDisplay');
    if (liquidityEl && economy.liquidity !== undefined) {
      liquidityEl.textContent = `${economy.liquidity}%`;
    }
    
    // Update treasury
    const treasuryEl = document.getElementById('treasuryDisplay');
    if (treasuryEl && economy.treasury !== undefined) {
      treasuryEl.textContent = `₽${economy.treasury.toLocaleString()}`;
    }
  },
  
  // Update portfolio UI
  updatePortfolioUI(data) {
    const portfolio = data.portfolio || data;
    
    document.getElementById('portCash').textContent = `₽${(portfolio.cash || 0).toLocaleString()}`;
    document.getElementById('portBank').textContent = `₽${(portfolio.bank || 0).toLocaleString()}`;
    document.getElementById('portShares').textContent = (portfolio.shares || 0).toLocaleString();
    document.getElementById('portValue').textContent = `₽${(portfolio.marketValue || 0).toLocaleString()}`;
  },
  
  // Update watchlist UI
  updateWatchlistUI(data) {
    const container = document.getElementById('watchlistDisplay');
    if (!container) return;
    
    const items = data.watchlist || data || [];
    
    if (!items.length) {
      container.innerHTML = '<div class="empty-state">No watched companies</div>';
      return;
    }
    
    container.innerHTML = items.map(item => `
      <div class="watchlist-item">
        <span class="company-name">${item.company_name}</span>
        <span class="company-price">₽${(item.price || 0).toFixed(2)}</span>
        <span class="company-change ${(item.change || 0) >= 0 ? 'positive' : 'negative'}">
          ${(item.change || 0) >= 0 ? '+' : ''}${(item.change || 0).toFixed(2)}%
        </span>
      </div>
    `).join('');
  },
  
  // Update orders UI
  updateOrdersUI(data) {
    const container = document.getElementById('ordersDisplay');
    if (!container) return;
    
    const orders = data.orders || data || [];
    
    if (!orders.length) {
      container.innerHTML = '<div class="empty-state">No orders</div>';
      return;
    }
    
    container.innerHTML = orders.map(order => `
      <div class="order-item status-${order.status}">
        <span class="order-side ${order.side}">${order.side.toUpperCase()}</span>
        <span class="order-company">${order.company_name}</span>
        <span class="order-quantity">${order.quantity}</span>
        <span class="order-price">₽${order.price.toFixed(2)}</span>
        <span class="order-status">${order.status}</span>
      </div>
    `).join('');
  },
  
  // Update events UI
  updateEventsUI(data) {
    const container = document.getElementById('marketEventsList');
    if (!container) return;
    
    const events = data.events || data || [];
    
    document.getElementById('eventCount').textContent = events.length;
    
    if (!events.length) {
      container.innerHTML = '<div class="empty-state">No recent events</div>';
      return;
    }
    
    container.innerHTML = events.slice(0, 5).map(event => `
      <div class="event-item severity-${event.severity}">
        <span class="event-title">${event.title}</span>
        <span class="event-description">${event.description || ''}</span>
        <span class="event-time">${new Date(event.created_at).toLocaleString()}</span>
      </div>
    `).join('');
  },
  
  // Update order book UI
  updateOrderBook(data) {
    const bidContainer = document.getElementById('bidList');
    const askContainer = document.getElementById('askList');
    
    if (!bidContainer || !askContainer) return;
    
    const book = data.order_book || data;
    
    if (book.bids && book.bids.length) {
      bidContainer.innerHTML = book.bids.slice(0, 8).map(bid => `
        <div class="order-book-level">
          <span class="price">₽${bid.price.toFixed(2)}</span>
          <span class="quantity">${bid.total_quantity}</span>
        </div>
      `).join('');
    } else {
      bidContainer.innerHTML = 'No bids';
    }
    
    if (book.asks && book.asks.length) {
      askContainer.innerHTML = book.asks.slice(0, 8).map(ask => `
        <div class="order-book-level">
          <span class="price">₽${ask.price.toFixed(2)}</span>
          <span class="quantity">${ask.total_quantity}</span>
        </div>
      `).join('');
    } else {
      askContainer.innerHTML = 'No asks';
    }
  },
  
  // Update chart
  updateChart(history) {
    if (typeof Chart === 'undefined') return;
    
    const canvas = document.getElementById('marketIndexChart');
    if (!canvas) return;
    
    const points = history && history.length ? history.slice(-100) : [];
    const labels = points.map(p => new Date(p.timestamp).toLocaleTimeString());
    const prices = points.map(p => p.price);
    
    if (this.chartInstance) {
      this.chartInstance.data.labels = labels;
      this.chartInstance.data.datasets[0].data = prices;
      this.chartInstance.update('none');
      return;
    }
    
    const ctx = canvas.getContext('2d');
    this.chartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Red Star Index',
          data: prices,
          borderColor: '#efc94c',
          backgroundColor: 'rgba(239, 201, 76, 0.1)',
          borderWidth: 2,
          fill: true,
          tension: 0.3
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (context) => `₽${context.parsed.y.toFixed(2)}`
            }
          }
        },
        scales: {
          x: { grid: { display: false } },
          y: {
            grid: { color: 'rgba(255,255,255,0.1)' },
            ticks: {
              callback: (value) => `₽${value.toFixed(2)}`
            }
          }
        }
      }
    });
  },
  
  // Update connection status
  updateConnectionStatus(status) {
    const apiStatus = document.getElementById('apiStatus');
    if (!apiStatus) return;
    
    apiStatus.className = `api-status ${status}`;
    const text = document.getElementById('apiStatusText');
    if (text) {
      text.textContent = status === 'online' ? 'Live Market Feed' : 'Market Feed Offline';
    }
  },
  
  // Bind UI events
  bindEvents() {
    // Refresh portfolio button
    document.getElementById('refreshPortfolio')?.addEventListener('click', () => {
      this.loadPortfolio();
      this.loadWatchlist();
      this.loadOrders();
    });
    
    // Toggle dashboard visibility
    document.querySelector('[data-page="marketDashboardPage"]')?.addEventListener('click', () => {
      showPage('marketDashboardPage', true);
    });
  }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  // Only initialize if market dashboard exists
  if (document.getElementById('marketDashboardPage')) {
    MarketClient.init();
  }
});
