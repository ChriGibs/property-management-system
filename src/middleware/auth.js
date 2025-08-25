// Middleware to check if user is authenticated
function requireAuth(req, res, next) {
  if (req.session && req.session.user) {
    // Make user available as req.user for convenience
    req.user = req.session.user;
    return next();
  }
  
  req.flash('error', 'Please log in to access this page');
  res.redirect('/auth/login');
}

// Middleware to check if tenant is authenticated  
function requireTenantAuth(req, res, next) {
  if (req.session.tenant) {
    // Make tenant available as req.user for convenience
    req.user = req.session.tenant;
    return next();
  }
  req.flash('error', 'Please log in to access your tenant portal');
  res.redirect('/tenant-auth/login');
}

// Middleware to redirect authenticated users away from login pages
function redirectIfAuth(req, res, next) {
  if (req.session.user) {
    return res.redirect('/dashboard');
  }
  next();
}

// Middleware to redirect authenticated tenants away from login pages
function redirectIfTenantAuth(req, res, next) {
  if (req.session.tenant) {
    return res.redirect('/tenant-portal');
  }
  next();
}

module.exports = {
  requireAuth,
  requireTenantAuth,
  redirectIfAuth,
  redirectIfTenantAuth,
  requireAdmin: function(req, res, next) {
    if (req.session && req.session.user && req.session.user.role === 'admin') {
      return next();
    }
    req.flash('error', 'Admin privileges required');
    return res.redirect('back');
  }
};


