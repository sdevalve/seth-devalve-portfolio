"""Pure-NumPy MLP primitives shared across NFL TV ratings notebooks."""
import numpy as np


def relu(Z):
    return np.maximum(0, Z)

def deriv_relu(Z):  # derivitive of ReLU activtion
    return Z > 0


# layer_dims is a list describing the shape of the whole network [2000, 512, 128, 1]
def init_params(layer_dims, strategy='he'):
    params = {}
    for l in range(1, len(layer_dims)):  # skip the input layer ([l-1] used in loop)
        n_in, n_out = layer_dims[l-1], layer_dims[l]
        # n_in is how many neurons are feeding into layer l, n_out is how many neurons are in layer l

        if strategy == 'he':  # He initialization
            params[f'W{l}'] = np.random.randn(n_out, n_in) * np.sqrt(2.0 / n_in)  # creates weight matrix of shape (n_out, n_in)

        elif strategy == 'xavier':  # Xavier initialization
            params[f'W{l}'] = np.random.randn(n_out, n_in) * np.sqrt(1.0 / n_in)

        elif strategy == 'uniform':  # Uniform intialization
            limit = np.sqrt(1.0 / n_in)
            params[f'W{l}'] = np.random.uniform(-limit, limit, (n_out, n_in))
        else:
            raise ValueError(f"Unknown strategy '{strategy}'.")

        # one bias per output neuron, initialized to zero (random weights already break symmetry)
        params[f'b{l}'] = np.zeros((n_out, 1))
    return params

# the entire params dictionary gets passed into forward_prop and updated by Adam optimizer each training batch


def init_adam_state(params):
    '''
    m_ : first moment -  "momentum" slot
    v_ : second moment - "variance" slot

    creates two running accumulators for every parameter matrix (W and b) both initialized to zero
    '''
    state = {}
    for key in params:
        state[f'm_{key}'] = np.zeros_like(params[key])
        state[f'v_{key}'] = np.zeros_like(params[key])
    return state


def forward_prop(X, params, output_activation='linear', keep_probs=None, training=False):
    '''
    X: the input matrix shape (features, m) - column-major convention
    params: the dict from init_params
    output_activation: declared but not called, the output is always linear (no activation applied) which is correct for regression

    keep_probs: list of keep probabilities, one per hidden layer.
            e.g. [0.7, 0.7] for a 2-hidden-layer network.
            None = no dropout.

    training:   set False at validation/inference to disable dropout.

    '''

    caches = {'A0': X}     # caches is a dict that will store intermediate values needed by back_prop() when calculating partial derivitives
    A = X                  # the running variable that carries the current activation through the loop
    L = len(params) // 2   # two keys per layer (W, b) so dividing by 2 gives total number of model layers

    for l in range(1, L):  # deliberately bypasses input layer and last layer, which is handled separately
        Z = params[f'W{l}'] @ A + params[f'b{l}']
        A = relu(Z)
        caches[f'Z{l}'] = Z

        if training and keep_probs is not None:
            kp = keep_probs[l - 1]
            mask = (np.random.rand(*A.shape) < kp) / kp  # inverted dropout
            A = A * mask
            caches[f'D{l}'] = mask   # must store, needed for backprop

        caches[f'A{l}'] = A

    # Output layer
    ZL = params[f'W{L}'] @ A + params[f'b{L}']
    caches[f'Z{L}'] = ZL    # no activation, for regression you want unbounded, real-valued output, so the pre-activation value is the prediction.
    caches[f'A{L}'] = ZL    # pre-activation and activation value are the same value

    return ZL, caches


def back_prop(AL, y, caches, params):
    grads = {}            # accumulates dW{l} and db{l} for every layer.
    L = len(params) // 2  # Total number of layers
    m = y.size            # batch size

    dZ = (2 / m) * (AL - y.reshape(1, -1))  # derivitive of MSE

    for l in reversed(range(1, L + 1)):  # loop backwards through the layers

        A_prev = caches['A0'] if l == 1 else caches[f'A{l-1}']
        grads[f'dW{l}'] = (1/m) * (dZ @ A_prev.T)                       # derivitive of Loss with respect to Weights
        grads[f'db{l}'] = (1/m) * np.sum(dZ, axis=1, keepdims=True)     # derivitive of Loss with respect to Bias

        if l > 1:
            dA_prev = params[f'W{l}'].T @ dZ
            if f'D{l-1}' in caches:               # if dropout was applied in forward pass, apply it here too. D is the mask applied during dropout
                dA_prev = dA_prev * caches[f'D{l-1}']  # chain rule (d(A * mask) / dA = mask) requires differentiating through every operation in the forward pass
            dZ = dA_prev * deriv_relu(caches[f'Z{l-1}']) # propogating delta backwards

    dX = params['W1'].T @ dZ  # gradient w.r.t. MLP input — needed by embedding notebook to update embedding tables
    return grads, dX


def update_params_adam(params, grads, state, alpha, t,
                       beta1=0.9, beta2=0.999, eps=1e-8):
    '''
    ADAM = "Adaptive Moment Estimation": it combines two older ideas - momentum and RMSProp.
    This is learning rate optimization; each parameter in `params` gets its own effective learning rate.
    If a weight's gradient has been large and frequent (dense numerical features), the step is damped.
    If a weight's gradient has been small and rare (sparse OHE weights), the step is amplified.
    This is what makes Adam dramatically better than standard SGD on tabular data with mixed feature types.

    params: weight and bias dictionary
    grads:  gradient matrices (dW, db) for each parameter
    state:  moment dictionary
    alpha:  global learning rate
    beta1:  EMA decay rate for the first moment (gradient direction)
    beta2:  EMA decay rate for the second moment (squared gradient)
    eps:    numerical floor to prevent division by zero

    Adam update for MLP weights and biases.

    m_t = β1·m_{t-1} + (1-β1)·g       exponential moving average of gradient
    v_t = β2·v_{t-1} + (1-β2)·g²      exponential moving average of squared gradient
    m̂  = m_t / (1 - β1^t)             bias-corrected (large early, shrinks fast)
    v̂  = v_t / (1 - β2^t)             bias-corrected
    θ   = θ - α · m̂ / (√v̂ + ε)        per-parameter adaptive step

    t: global step count, incremented once per mini-batch before calling this function.
    '''
    L = len(params) // 2
    for l in range(1, L + 1):
        for p, g_key in [(f'W{l}', f'dW{l}'), (f'b{l}', f'db{l}')]:

            # Moment updates
            state[f'm_{p}'] = beta1 * state[f'm_{p}'] + (1 - beta1) * grads[g_key]        # first moment: EMA of raw gradients — keeps 90% of old average, blends in 10% of current gradient
            state[f'v_{p}'] = beta2 * state[f'v_{p}'] + (1 - beta2) * grads[g_key] ** 2   # second moment: EMA of squared gradients — much slower decay (99.9%), tracks gradient magnitude history

            # Bias correction: both corrections vanish as t increases; without this, Adam undershoots badly in the first few hundred batches
            m_hat = state[f'm_{p}'] / (1 - beta1 ** t)   # bias-corrected smoothed gradient direction
            v_hat = state[f'v_{p}'] / (1 - beta2 ** t)   # bias-corrected mean of squared gradients (sqrt gives RMS of gradient magnitudes)

            # Parameter update: dividing by sqrt(v_hat) gives each parameter its own effective learning rate
            params[p] -= alpha * m_hat / (np.sqrt(v_hat) + eps)

    return params, state


def mse_loss(AL, y):  # Loss function
    '''
    AL:  the networks predictions, shape (1, m) (one row and m columns, one column for every sample in the batch), comes directly from forward prop
    y:   the true target values, shape (m,)

    .squeeze() converts a (1, m) array to (m,), matching y

    '''
    return np.mean((AL.squeeze() - y) ** 2)
